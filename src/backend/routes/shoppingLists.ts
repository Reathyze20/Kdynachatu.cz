import { Router, Request, Response } from "express";
import { protect } from "../../middleware/authMiddleware";
import { requireCabin } from "../../middleware/cabinMiddleware";
import { validate } from "../../validators/validate";
import { createShoppingListSchema, renameShoppingListSchema } from "../../validators/schemas";
import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import { emitToCabin } from "../../utils/socket";

const router = Router();

// ============================================================================
//                           GET ALL ACTIVE LISTS
// ============================================================================
router.get("/", protect, requireCabin, async (req: Request, res: Response) => {
    try {
        const lists = await prisma.shoppingList.findMany({
            // Legacy pantry lists from the old UI stay hidden until the contract migration removes them.
            where: { isResolved: false, isPantry: false, cabinId: req.user!.cabinId! },
            orderBy: {
                createdAt: "desc",
            },
            omit: { isPantry: true },
            include: {
                createdBy: {
                    select: { id: true, username: true, color: true, animalIcon: true },
                },
                items: {
                    omit: { purchased: true },
                    include: {
                        addedBy: {
                            select: { id: true, username: true, color: true, animalIcon: true },
                        },
                        purchasedBy: {
                            select: { id: true, username: true, color: true, animalIcon: true },
                        },
                        splits: true,
                    }
                }
            },
        });

        res.json(lists);
    } catch (error) {
        logger.error("SHOPPING_LISTS", "Failed to fetch shopping lists", error);
        res.status(500).json({ message: "Nepodařilo se načíst nákupní seznamy" });
    }
});

// ============================================================================
//                           CREATE NEW LIST
// ============================================================================
router.post("/", protect, requireCabin, validate(createShoppingListSchema), async (req: Request, res: Response) => {
    try {
        const { name } = req.body;

        const userId = req.user!.userId;

        const newList = await prisma.shoppingList.create({
            data: {
                name: name.trim(),
                createdById: userId,
                cabinId: req.user!.cabinId!,
            },
            omit: { isPantry: true },
            include: {
                createdBy: {
                    select: { id: true, username: true, color: true },
                },
                items: true,
            }
        });

        emitToCabin(req.user!.cabinId!, "shopping:list:changed", { id: newList.id });
        res.status(201).json(newList);
    } catch (error) {
        logger.error("SHOPPING_LISTS", "Failed to create shopping list", error);
        res.status(500).json({ message: "Nepodařilo se vytvořit seznam" });
    }
});

// ============================================================================
//                           RENAME LIST
// ============================================================================
router.patch("/:id/rename", protect, requireCabin, validate(renameShoppingListSchema), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name } = req.body;

        const list = await prisma.shoppingList.findFirst({
            where: { id, cabinId: req.user!.cabinId },
        });

        if (!list) {
            return res.status(404).json({ message: "Seznam nenalezen" });
        }

        if (list.createdById !== req.user!.userId && req.user!.role !== "admin") {
            return res.status(403).json({ error: "Nemáte oprávnění přejmenovat tento seznam" });
        }

        const updated = await prisma.shoppingList.update({
            where: { id },
            data: { name: name.trim() },
            omit: { isPantry: true },
            include: {
                createdBy: {
                    select: { id: true, username: true, color: true, animalIcon: true },
                },
                items: {
                    omit: { purchased: true },
                    include: {
                        addedBy: {
                            select: { id: true, username: true, color: true, animalIcon: true },
                        },
                        purchasedBy: {
                            select: { id: true, username: true, color: true, animalIcon: true },
                        },
                        splits: true,
                    }
                }
            },
        });

        emitToCabin(req.user!.cabinId!, "shopping:list:changed", { id: updated.id });
        res.json(updated);
    } catch (error) {
        logger.error("SHOPPING_LISTS", "Failed to rename shopping list", error);
        res.status(500).json({ error: "Nepodařilo se přejmenovat seznam" });
    }
});

// ============================================================================
//                           DELETE LIST
// ============================================================================
router.delete("/:id", protect, requireCabin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const list = await prisma.shoppingList.findFirst({
            where: { id, cabinId: req.user!.cabinId },
        });

        if (!list) {
            return res.status(404).json({ message: "Seznam nenalezen" });
        }

        if (list.createdById !== req.user!.userId && req.user!.role !== "admin") {
            return res.status(403).json({ message: "Nemáte oprávnění smazat tento seznam" });
        }

        const cabinId = req.user!.cabinId!;
        const changedInventoryIds = await prisma.$transaction(async (tx) => {
            // Find all items with linked inventory before deleting
            const itemsWithInventory = await tx.shoppingListItem.findMany({
                where: { listId: id, linkedInventoryId: { not: null } },
                select: { linkedInventoryId: true },
            });

            // Delete the list (cascades to items)
            await tx.shoppingList.delete({ where: { id } });

            // Reset inCart for linked inventory items of the own cabin
            const inventoryIds = [...new Set(itemsWithInventory
                .map((i) => i.linkedInventoryId)
                .filter((id): id is string => id !== null))];
            if (inventoryIds.length === 0) return [];
            const owned = await tx.inventoryItem.findMany({
                where: { id: { in: inventoryIds }, cabinId },
                select: { id: true },
            });
            await tx.inventoryItem.updateMany({
                where: { id: { in: owned.map((i) => i.id) }, cabinId },
                data: { inCart: false },
            });
            return owned.map((i) => i.id);
        });

        emitToCabin(cabinId, "shopping:list:changed", { id: req.params.id });
        for (const inventoryId of changedInventoryIds) {
            emitToCabin(cabinId, "inventory:updated", { id: inventoryId });
        }
        res.json({ message: "List deleted successfully" });
    } catch (error) {
        logger.error("SHOPPING_LISTS", "Failed to delete shopping list", error);
        res.status(500).json({ message: "Nepodařilo se smazat seznam" });
    }
});

// ============================================================================
//                           RESOLVE/ARCHIVE LIST
// ============================================================================
router.patch("/:id/resolve", protect, requireCabin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { isResolved } = req.body;

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        const user = req.user!;

        const list = await prisma.shoppingList.findFirst({
            where: { id, cabinId: req.user!.cabinId },
        });

        if (!list) {
            return res.status(404).json({ message: "Seznam nenalezen" });
        }

        // Potentially only creator or admin can resolve? Or anyone?
        // Let's allow anyone to resolve a shopping list for flexibility
        const updatedList = await prisma.shoppingList.update({
            where: { id },
            data: {
                isResolved: Boolean(isResolved)
            },
            omit: { isPantry: true },
        });

        emitToCabin(req.user!.cabinId!, "shopping:list:changed", { id: updatedList.id });
        res.json(updatedList);
    } catch (error) {
        logger.error("SHOPPING_LISTS", "Failed to resolve shopping list", error);
        res.status(500).json({ message: "Nepodařilo se archivovat seznam" });
    }
});

export default router;

