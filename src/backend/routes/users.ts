import { Router, Request, Response } from "express";
import { protect } from "../../middleware/authMiddleware";
import { requireCabin } from "../../middleware/cabinMiddleware";
import { requireRole } from "../../middleware/roleMiddleware";
import { validate } from "../../validators/validate";
import { createUserSchema, updateProfileSchema, changeMyPasswordSchema, logoutEverywhereSchema, changeRoleSchema, changePasswordSchema, adminUpdateUserSchema } from "../../validators/schemas";
import { hashPassword, verifyPassword } from "../../utils/password";
import prisma from "../../utils/prisma";
import { Prisma } from "../../generated/prisma/client.js";
import logger from "../../utils/logger";
import { signAuthToken } from "../../utils/authToken";
import { sendEmailChangedNotice } from "../../utils/email";
import { deleteUserAndRevokeSessions, revokeUserSessions, updateUserAndRevokeSessions } from "../../utils/sessionRevocation";
import { disconnectUserSockets } from "../../utils/socket";
import type { JwtPayload } from "../../types";

const router = Router();
const adminOnly = requireRole(["admin"], "Přístup pouze pro administrátora.");

const USERNAME_TAKEN_MESSAGE = "Uživatelské jméno již existuje."; // stejná hláška jako POST /api/register

// Superadmin je pro správce i členy chaty neviditelný (#474): v seznamu chybí a adminské operace
// na něm odpoví stejnou 404 jako na neexistujícího uživatele. Vidí ho jen superadmin.
const hideSuperAdminFrom = (caller: JwtPayload): Prisma.UserWhereInput =>
  caller.isSuperAdmin ? {} : { isSuperAdmin: false };

/** Cíl adminské operace: uživatel z chaty volajícího, kterého volající smí vidět, jinak null (→ 404). */
const findCabinTarget = (id: string, caller: JwtPayload) =>
  prisma.user.findFirst({ where: { id, cabinId: caller.cabinId, ...hideSuperAdminFrom(caller) } });

// ============================================================================
//                          GET ALL USERS (safe)
// ============================================================================
router.get("/", protect, requireCabin, async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { cabinId: req.user!.cabinId, ...hideSuperAdminFrom(req.user!) },
      select: {
        id: true,
        username: true,
        color: true,
        role: true,
        animalIcon: true,
        email: true,
        createdAt: true,
        isVerified: true,
        isBanned: true,
        _count: {
          select: {
            reservations: true,
            galleryPhotos: true,
            noteThreads: true,
          },
        },
      },
    });
    res.json(users);
  } catch (error) {
    logger.error("USERS", "Get users error", { error: String(error) });
    res.status(500).json({ message: "Chyba při načítání uživatelů." });
  }
});

// ============================================================================
//                          CREATE USER (ADMIN)
// ============================================================================
router.post("/", protect, requireCabin, validate(createUserSchema), adminOnly, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

  const { username, password, role } = req.body;

  try {
    // Jméno je unikátní napříč chatami: kontrola globálně a bez ohledu na velikost písmen, se stejnou
    // odpovědí jako veřejná registrace – neprozradí víc než ona (#420).
    const existingUser = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingUser) {
      return res.status(409).json({ message: USERNAME_TAKEN_MESSAGE });
    }

    const passwordHash = await hashPassword(password);
    const randomColor = "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role || "user",
        color: randomColor,
        cabinId: req.user!.cabinId,
        isVerified: true, // účet zakládá správce chaty, žádný e-mail k ověření (#476)
      },
    });

    res.status(201).json({ message: "Uživatel vytvořen.", user: { id: newUser.id, username: newUser.username } });
  } catch (error) {
    // Souběžná žádost o stejné jméno prošla kontrolou dřív, než tahle zapsala – unikátní index.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: USERNAME_TAKEN_MESSAGE });
    }
    logger.error("USERS", "Create user error", { error: String(error) });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                                GET MY PROFILE
// ============================================================================
router.get("/me", protect, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Nejdřív se přihlas." });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        email: true,
        color: true,
        animalIcon: true,
        role: true,
        isEmailVerified: true
      }
    });
    if (!user) return res.status(404).json({ message: "Uživatel nenalezen" });
    res.json(user);
  } catch (error) {
    logger.error("USERS", "Get me error", { error: String(error) });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                                UPDATE MY PROFILE
// ============================================================================
router.patch("/me", protect, validate(updateProfileSchema), async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Nejdřív se přihlas." });

  const { email, color, animalIcon, currentPassword } = req.body;

  try {
    // Změna e-mailu chce současné heslo (#475): ukradený token nesmí stačit na vlastní adresu + reset hesla.
    const current = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { username: true, email: true, passwordHash: true },
    });
    if (!current) return res.status(404).json({ message: "Uživatel nenalezen" });

    const emailChanged = email !== undefined && email !== current.email;
    if (emailChanged && !(currentPassword && (await verifyPassword(currentPassword, current.passwordHash)))) {
      return res.status(403).json({
        message: currentPassword ? "Nesprávné heslo. Zkus to znovu." : "Pro změnu e-mailu zadej své současné heslo.",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        email: email !== undefined ? email : undefined,
        color: color !== undefined ? color : undefined,
        animalIcon: animalIcon !== undefined ? animalIcon : undefined
      },
      select: { email: true, color: true, animalIcon: true }
    });

    if (emailChanged && current.email) {
      // Změna už platí; nedoručené upozornění ji nevrací, jen se zaloguje.
      try {
        await sendEmailChangedNotice(current.email, { username: current.username, newEmail: updatedUser.email });
      } catch (error) {
        logger.error("USERS", "E-mail changed notice failed", { userId: req.user.userId, error: String(error) });
      }
    }

    res.json({ message: "Profil aktualizován.", user: updatedUser });
  } catch (error) {
    logger.error("USERS", "Update me error", { error: String(error) });
    res.status(500).json({ message: "Chyba při updatu profilu." });
  }
});

// ============================================================================
//                            CHANGE MY PASSWORD
// ============================================================================
router.patch("/me/password", protect, validate(changeMyPasswordSchema), async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Nejdřív se přihlas." });

  const { oldPassword, newPassword } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user || !(await verifyPassword(oldPassword, user.passwordHash))) {
      return res.status(400).json({ message: "Nesprávné původní heslo." });
    }

    // Ostatní zařízení se odhlásí, aktuální dostane token s novou verzí (#485).
    const passwordHash = await hashPassword(newPassword);
    const tokenVersion = await updateUserAndRevokeSessions(user.id, { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null });

    const token = signAuthToken({ ...user, tokenVersion });
    res.json({ message: "Heslo úspěšně změněno.", token });
  } catch (error) {
    logger.error("USERS", "Change my password error", { error: String(error) });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//               LOG OUT EVERYWHERE (#485) — i z aktuálního zařízení
// ============================================================================
router.post("/me/logout-all", protect, validate(logoutEverywhereSchema), async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Nejdřív se přihlas." });

  try {
    await revokeUserSessions(req.user.userId);
    logger.info("USERS", "User logged out everywhere", { userId: req.user.userId });
    res.json({ message: "Odhlásili jsme tě na všech zařízeních." });
  } catch (error) {
    logger.error("USERS", "Logout everywhere error", { error: String(error), userId: req.user.userId });
    res.status(500).json({ message: "Odhlášení se nepovedlo. Zkus to znovu." });
  }
});

// ============================================================================
//               DELETE MY ACCOUNT (GDPR Art. 17 — Self-service)
// ============================================================================
// Must be registered before `router.delete("/:id")`, otherwise Express routes `/me` there with id `me` (#419).
router.delete("/me", protect, async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

    const { password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Pro smazání účtu zadej heslo." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ message: "Uživatel nenalezen." });

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: "Nesprávné heslo." });
    }

    // If admin, check if they're the only one
    if (user.cabinId && req.user.role === "admin") {
      const adminCount = await prisma.user.count({
        where: { cabinId: user.cabinId, role: "admin" },
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Jsi poslední admin chaty. Nejdřív předej roli admina jinému členovi.",
        });
      }
    }

    // Delete user — Prisma cascade handles related records
    await deleteUserAndRevokeSessions(req.user.userId);

    logger.info("USERS", "User self-deleted account (GDPR)", {
      userId: req.user.userId,
      username: req.user.username,
    });

    res.json({ message: "Tvůj účet jsme nenávratně smazali." });
  } catch (error) {
    logger.error("USERS", "Self-delete account error", { error: String(error) });
    res.status(500).json({ message: "Chyba při mazání účtu." });
  }
});

// ============================================================================
//                    DELETE USER'S RESERVATIONS
// ============================================================================
router.delete("/:id/reservations", protect, requireCabin, adminOnly, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

  const { id } = req.params;

  try {
    await prisma.reservation.deleteMany({
      where: { userId: id, cabinId: req.user.cabinId },
    });
    res.status(200).json({ message: "Rezervace smazány." });
  } catch (error) {
    logger.error("USERS", "Delete reservations error", { error: String(error), userId: id });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                          CHANGE USER ROLE
// ============================================================================
router.put("/:id/role", protect, requireCabin, validate(changeRoleSchema), adminOnly, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

  const { id } = req.params;
  const { role } = req.body;

  try {
    // Verify target user belongs to same cabin
    const targetUser = await findCabinTarget(id, req.user);
    if (!targetUser) {
      return res.status(404).json({ message: "Uživatel nenalezen." });
    }

    await updateUserAndRevokeSessions(id, { role });
    res.status(200).json({ message: "Role změněna." });
  } catch (error) {
    logger.error("USERS", "Change role error", { error: String(error), userId: id });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                        CHANGE USER PASSWORD
// ============================================================================
router.put("/:id/password", protect, requireCabin, validate(changePasswordSchema), adminOnly, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

  const { id } = req.params;
  const { password } = req.body;

  try {
    // Verify target user belongs to same cabin
    const targetUser = await findCabinTarget(id, req.user);
    if (!targetUser) {
      return res.status(404).json({ message: "Uživatel nenalezen." });
    }

    const passwordHash = await hashPassword(password);
    await updateUserAndRevokeSessions(id, { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null });
    res.status(200).json({ message: "Heslo změněno." });
  } catch (error) {
    logger.error("USERS", "Change password error", { error: String(error), userId: id });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                          UPDATE USER (ADMIN)
// ============================================================================
router.patch("/:id", protect, requireCabin, validate(adminUpdateUserSchema), adminOnly, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

  const { id } = req.params;
  const { role, password } = req.body;

  try {
    // Verify target user belongs to same cabin
    const targetUser = await findCabinTarget(id, req.user);
    if (!targetUser) {
      return res.status(404).json({ message: "Uživatel nenalezen." });
    }

    const data: any = {};
    if (role) data.role = role;
    if (password && password.length >= 8) {
      data.passwordHash = await hashPassword(password);
      data.passwordResetToken = null;
      data.passwordResetExpiresAt = null;
    }

    // Změna role nebo hesla zneplatní stará přihlášení (#485).
    if (data.role || data.passwordHash) await updateUserAndRevokeSessions(id, data);
    else await prisma.user.update({ where: { id }, data });
    res.status(200).json({ message: "Uživatel upraven." });
  } catch (error) {
    logger.error("USERS", "Update user error", { error: String(error), userId: id });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                            DELETE USER
// ============================================================================
router.delete("/:id", protect, requireCabin, adminOnly, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

  const { id } = req.params;

  try {
    // Verify target user belongs to same cabin
    const targetUser = await findCabinTarget(id, req.user);
    if (!targetUser) {
      return res.status(404).json({ message: "Uživatel nenalezen." });
    }

    await deleteUserAndRevokeSessions(id);
    res.status(200).json({ message: "Uživatel smazán." });
  } catch (error) {
    logger.error("USERS", "Delete user error", { error: String(error), userId: id });
    res.status(500).json({ message: "Chyba." });
  }
});

// ============================================================================
//                   SOFT REMOVE USER FROM CABIN (ADMIN)
// ============================================================================
router.patch("/:id/remove-from-cabin", protect, requireCabin, adminOnly, async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

    const { id } = req.params;
    const { deleteData } = req.body;

    // Cannot remove yourself
    if (id === req.user.userId) {
      return res.status(400).json({ message: "Sebe z chaty odebrat nemůžeš." });
    }

    // Verify target user belongs to same cabin
    const targetUser = await findCabinTarget(id, req.user);
    if (!targetUser) {
      return res.status(404).json({ message: "Uživatel nenalezen." });
    }

    if (deleteData) {
      // Hard remove — delete user entirely (cascade)
      await deleteUserAndRevokeSessions(id);
      logger.info("USERS", "User hard-removed from cabin (data deleted)", {
        userId: id,
        username: targetUser.username,
        cabinId: req.user.cabinId,
        removedBy: req.user.userId,
      });
      res.json({ message: "Uživatel a jeho data byly smazány." });
    } else {
      // Soft remove — keep user but unlink from cabin
      await updateUserAndRevokeSessions(id, { cabinId: null, role: "user" });
      logger.info("USERS", "User soft-removed from cabin (data preserved)", {
        userId: id,
        username: targetUser.username,
        cabinId: req.user.cabinId,
        removedBy: req.user.userId,
      });
      res.json({ message: "Uživatel byl odebrán z chaty. Jeho data zůstala zachována." });
    }
  } catch (error) {
    logger.error("USERS", "Remove from cabin error", { error: String(error) });
    res.status(500).json({ message: "Chyba při odebírání uživatele." });
  }
});

// ============================================================================
//                   EXPORT MY DATA (GDPR Art. 20)
// ============================================================================
router.get("/me/export", protect, async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

    const userId = req.user.userId;

    // Parallel fetch of all user data
    const [
      profile,
      reservations,
      noteThreads,
      notes,
      diaryEntries,
      galleryPhotos,
      shoppingItems,
      reconstructionItems,
      availabilities,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          color: true,
          animalIcon: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.reservation.findMany({
        where: { userId },
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          purpose: true,
          notes: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.noteThread.findMany({
        where: { createdById: userId },
        select: { id: true, name: true, createdAt: true },
      }),
      prisma.note.findMany({
        where: { userId },
        select: { id: true, message: true, createdAt: true },
      }),
      prisma.diaryEntry.findMany({
        where: { authorId: userId },
        select: { id: true, content: true, entryDate: true, createdAt: true },
      }),
      prisma.galleryPhoto.findMany({
        where: { uploadedById: userId },
        select: { id: true, src: true, description: true, createdAt: true },
      }),
      prisma.shoppingListItem.findMany({
        where: { addedById: userId },
        select: { id: true, name: true, status: true, price: true, createdAt: true },
      }),
      prisma.reconstructionItem.findMany({
        where: { createdById: userId },
        select: { id: true, title: true, description: true, status: true, createdAt: true },
      }),
      prisma.userAvailability.findMany({
        where: { userId },
        select: { id: true, startDate: true, endDate: true, createdAt: true },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile,
      reservations,
      noteThreads,
      notes,
      diaryEntries,
      galleryPhotos: galleryPhotos.map(p => ({ ...p, note: "Soubory fotografií nejsou součástí exportu." })),
      shoppingItems,
      reconstructionItems,
      availabilities,
    };

    res.setHeader("Content-Disposition", "attachment; filename=moje-data.json");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json(exportData);
  } catch (error) {
    logger.error("USERS", "Export my data error", { error: String(error) });
    res.status(500).json({ message: "Chyba při exportu dat." });
  }
});

// ============================================================================
//                     LEAVE CABIN (SELF-SERVICE)
// ============================================================================
router.post("/me/leave-cabin", protect, requireCabin, async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Neautorizováno" });

    // Check if user is the only admin — cannot leave
    if (req.user.role === "admin") {
      const adminCount = await prisma.user.count({
        where: { cabinId: req.user.cabinId, role: "admin" },
      });
      if (adminCount <= 1) {
        return res.status(400).json({
          message: "Jsi poslední admin chaty. Nejdřív předej roli admina jinému členovi.",
        });
      }
    }

    // Soft leave — keep user, unlink from cabin
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { cabinId: null, role: "user" },
    });
    // Živé sockety by zůstaly v roomu chaty; po odpojení se klient připojí znovu už bez něj (#486).
    disconnectUserSockets(req.user.userId);

    logger.info("USERS", "User left cabin voluntarily", {
      userId: req.user.userId,
      username: req.user.username,
      cabinId: req.user.cabinId,
    });

    res.json({ message: "Už nejsi v této chatě." });
  } catch (error) {
    logger.error("USERS", "Leave cabin error", { error: String(error) });
    res.status(500).json({ message: "Chyba při opouštění chaty." });
  }
});

export default router;
