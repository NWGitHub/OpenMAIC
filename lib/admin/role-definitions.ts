import { prisma } from '@/lib/auth/prisma';
import { DEFAULT_BUILT_IN_ROLES } from '@/lib/admin/permissions';

export async function ensureBuiltInRoles() {
  await Promise.all(
    Object.entries(DEFAULT_BUILT_IN_ROLES).map(async ([name, definition]) => {
      const existing = await prisma.roleDefinition.findUnique({
        where: { name },
        select: { permissions: true },
      });

      // Additive merge: add any new default permissions that aren't already in the
      // DB row so that code-level additions take effect without overwriting admin
      // customisations or removing permissions admins deliberately added.
      const mergedPermissions = existing
        ? [...new Set([...existing.permissions, ...definition.permissions])]
        : [...definition.permissions];

      await prisma.roleDefinition.upsert({
        where: { name },
        update: {
          isBuiltIn: true,
          permissions: mergedPermissions,
        },
        create: {
          name,
          displayName: definition.displayName,
          description: definition.description,
          permissions: [...definition.permissions],
          isBuiltIn: true,
        },
      });
    }),
  );
}

export async function findRoleDefinitionById(id: string) {
  await ensureBuiltInRoles();
  return prisma.roleDefinition.findUnique({ where: { id } });
}