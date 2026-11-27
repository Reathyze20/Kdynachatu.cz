import { Router, Request, Response } from "express";
import { protect } from "../../middleware/authMiddleware";
import { requireCabin } from "../../middleware/cabinMiddleware";
import { requireRole } from "../../middleware/roleMiddleware";
import { validate } from "../../validators/validate";
import { createShoppingItemSchema, updateItemStatusSchema } from "../../validators/schemas";
import prisma from "../../utils/prisma";
import logger from "../../utils/logger";
import { emitToCabin } from "../../utils/socket";
import { inventoryEffect, isResolvedStatus, linkedInventoryChange } from "./shoppingItemStatus";

const router = Router();

// ============================================================================
//                        ADD ITEM TO LIST
// ============================================================================
router.post("/:listId/items", protect, requireCabin, validate(createShoppingItemSchema), async (req: Request, res: Response) => {
  const { name, isEssential, sourceMessageId } = req.body;
  const { listId } = req.params;

  try {
    // Verify list belongs to user's cabin
    const list = await prisma.shoppingList.findFirst({ where: { id: listId, cabinId: req.user!.cabinId } });
    if (!list) return res.status(404).json({ message: "Seznam nenalezen." });
    // The source message must belong to the caller's cabin; a foreign one is 404 (#483)
    if (sourceMessageId) {
      const source = await prisma.note.findFirst({ where: { id: sourceMessageId, cabinId: req.user!.cabinId! }, select: { id: true } });
      if (!source) return res.status(404).json({ message: "Zpráva nenalezena." });
    }

    const newItem = await prisma.shoppingListItem.create({
      data: {
        name,
        addedById: req.user!.userId,
        listId,
        isEssential: Boolean(isEssential ?? false),
        sourceMessageId: sourceMessageId || null,
      },
      include: {
        addedBy: { select: { username: true } },
      },
    });

    const itemPayload = {
      id: newItem.id,
      name: newItem.name,
      addedBy: newItem.addedBy.username,
      addedById: newItem.addedById,
      createdAt: newItem.createdAt.toISOString(),
      status: newItem.status,
      isEssential: newItem.isEssential,
    };
    emitToCabin(req.user!.cabinId!, "shopping:item:added", itemPayload);
    res.status(201).json(itemPayload);
  } catch (error) {
    logger.error("SHOPPING", "Add item error", { error: String(error) });
    res.status(500).json({ message: "Chyba" });
  }
});

// Item of the caller's cabin. An item without a list belongs to no cabin → 404, same as a foreign one.
function findCabinItem(cabinId: string, itemId: string) {
  return prisma.shoppingListItem.findFirst({
    where: { id: itemId, list: { cabinId } },
    include: { list: { select: { createdById: true } } },
  });
}

// Who may delete an item: its author, the founder of its list or a cabin admin (#679, same rule as ItemRow in the UI).
function canDeleteItem(user: { userId: string; role: string }, item: { addedById: string; list: { createdById: string } | null }) {
  return item.addedById === user.userId || item.list?.createdById === user.userId || user.role === "admin";
}

// ============================================================================
//                    MARK ITEM AS PURCHASED / UPDATE STATUS
// ============================================================================
async function handlePurchaseItem(req: Request, res: Response) {
  const { itemId } = req.params;
  const { status, price } = req.body;
  let { splitWith } = req.body;
  const isPurchased = status === "purchased";

  try {
    // Verify item's list belongs to user's cabin
    const item = await findCabinItem(req.user!.cabinId!, itemId);
    if (!item) {
      return res.status(404).json({ message: "Položka nenalezena." });
    }

    // Splits only with members of the same cabin
    if (isPurchased && Array.isArray(splitWith) && splitWith.length > 0) {
      const userIds = [...new Set<string>(splitWith)];
      const members = await prisma.user.count({ where: { id: { in: userIds }, cabinId: req.user!.cabinId } });
      if (members !== userIds.length) {
        return res.status(404).json({ message: "Uživatel nenalezen." });
      }
      splitWith = userIds;
    }

    const cabinId = req.user!.cabinId!;
    // "Bring from home" is resolved like "purchased": purchasedBy = who resolved it (bought or promised).
    const isResolved = isResolvedStatus(status);
    const effect = inventoryEffect(item.status, status);

    // Use transaction — update item + restock/reopen linked inventory + handle splits
    const { updated, splits, inventoryChanged } = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.shoppingListItem.update({
        where: { id: itemId },
        data: {
          status,
          purchasedById: isResolved ? req.user!.userId : null,
          purchasedAt: isResolved ? new Date() : null,
          price: isPurchased && price ? parseFloat(price) : null,
        },
        include: {
          addedBy: { select: { username: true } },
          purchasedBy: { select: { username: true } },
        },
      });

      // Linked inventory of the own cabin only; a vanished one is skipped, not a 500.
      let changedInventory = false;
      if (effect && updatedItem.linkedInventoryId) {
        const inventory = await tx.inventoryItem.findFirst({
          where: { id: updatedItem.linkedInventoryId, cabinId },
          select: { id: true, status: true },
        });
        if (inventory) {
          const { count } = await tx.inventoryItem.updateMany({
            where: { id: inventory.id, cabinId },
            data: linkedInventoryChange(effect, inventory.status),
          });
          changedInventory = count > 0;
        }
      }

      // Handle splits
      if (isPurchased && splitWith && Array.isArray(splitWith)) {
        await tx.shoppingItemSplit.deleteMany({ where: { itemId } });
        if (splitWith.length > 0) {
          await tx.shoppingItemSplit.createMany({
            data: splitWith.map((userId: string) => ({ itemId, userId })),
          });
        }
      } else if (!isPurchased) {
        await tx.shoppingItemSplit.deleteMany({ where: { itemId } });
      }

      const itemSplits = await tx.shoppingItemSplit.findMany({ where: { itemId } });
      return { updated: updatedItem, splits: itemSplits, inventoryChanged: changedInventory };
    });

    const updatedPayload = {
      id: updated.id,
      name: updated.name,
      addedBy: updated.addedBy.username,
      addedById: updated.addedById,
      createdAt: updated.createdAt.toISOString(),
      status: updated.status,
      purchasedBy: updated.purchasedBy?.username,
      purchasedById: updated.purchasedById,
      purchasedAt: updated.purchasedAt?.toISOString(),
      price: updated.price ? parseFloat(updated.price.toString()) : undefined,
      splitWith: splits.map((s) => s.userId),
      isEssential: updated.isEssential,
      linkedInventoryId: updated.linkedInventoryId,
    };
    emitToCabin(cabinId, "shopping:item:updated", updatedPayload);
    if (inventoryChanged) emitToCabin(cabinId, "inventory:updated", { id: updated.linkedInventoryId });
    res.json(updatedPayload);
  } catch (error) {
    logger.error("SHOPPING", "Purchase item error", { error: String(error), itemId });
    res.status(500).json({ message: "Chyba" });
  }
}

router.put("/:itemId/purchase", protect, requireCabin, validate(updateItemStatusSchema), handlePurchaseItem);

// ============================================================================
//                 TOGGLE isEssential ON SHOPPING ITEM
// ============================================================================
router.patch("/:itemId/toggle-essential", protect, requireCabin, requireRole(["admin", "user"], "Hosté nemohou měnit kritické položky."), async (req: Request, res: Response) => {
  const { itemId } = req.params;
  try {
    const item = await findCabinItem(req.user!.cabinId!, itemId);
    if (!item) {
      return res.status(404).json({ message: "Položka nenalezena." });
    }

    const updated = await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: { isEssential: !item.isEssential },
    });

    res.json({ id: updated.id, isEssential: updated.isEssential });
  } catch (error) {
    logger.error("SHOPPING", "Toggle essential error", { error: String(error), itemId });
    res.status(500).json({ message: "Chyba" });
  }
});

// ============================================================================
//                          DELETE ITEM
// ============================================================================
async function deleteItem(req: Request, res: Response) {
  const { itemId } = req.params;
  try {
    // Fetch the item and verify it belongs to user's cabin
    const item = await findCabinItem(req.user!.cabinId!, itemId);

    if (!item) {
      return res.status(404).json({ message: "Položka nenalezena" });
    }
    if (!canDeleteItem(req.user!, item)) {
      return res.status(403).json({ message: "Tuhle položku může smazat jen ten, kdo ji přidal, zakladatel seznamu nebo správce chaty." });
    }

    const cabinId = req.user!.cabinId!;
    // Delete the item and reset linked inventory in a transaction
    const inventoryChanged = await prisma.$transaction(async (tx) => {
      await tx.shoppingListItem.delete({ where: { id: itemId } });

      // If linked to the own cabin's inventory, reset inCart so it shows as "not in cart" again
      if (!item.linkedInventoryId) return false;
      const { count } = await tx.inventoryItem.updateMany({
        where: { id: item.linkedInventoryId, cabinId },
        data: { inCart: false },
      });
      return count > 0;
    });

    emitToCabin(cabinId, "shopping:item:deleted", { id: itemId });
    if (inventoryChanged) emitToCabin(cabinId, "inventory:updated", { id: item.linkedInventoryId });
    res.json({ success: true });
  } catch (error) {
    logger.error("SHOPPING", "Delete item error", { error: String(error), itemId });
    res.status(500).json({ message: "Chyba" });
  }
}

router.delete("/:itemId", protect, requireCabin, deleteItem);

export default router;

