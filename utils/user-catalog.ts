export interface CollaborationUser {
  email: string;
  picture?: string;
}

export interface UserCatalog {
  version: number;
  updatedAt: number;
  users: CollaborationUser[];
}

export function createEmptyUserCatalog(): UserCatalog {
  return {
    version: 1,
    updatedAt: 0,
    users: [],
  };
}

export function cloneUserCatalog(catalog: UserCatalog): UserCatalog {
  return {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    users: catalog.users.map((user) => ({ ...user })),
  };
}

export function encodeUsersPayload(catalog: UserCatalog): string {
  return JSON.stringify({
    v: catalog.version,
    u: catalog.updatedAt,
    users: catalog.users.map((user) => [user.email, user.picture ?? '']),
  });
}

export function decodeUsersPayload(
  description: string | null | undefined,
): UserCatalog | null {
  if (!description) {
    return null;
  }

  try {
    const parsed = JSON.parse(description) as {
      v?: number;
      u?: number;
      users?: Array<[string, string]>;
    };

    if (!parsed.users || !Array.isArray(parsed.users)) {
      return null;
    }

    const users = parsed.users
      .map(([email, picture]) => ({
        email: email.trim(),
        picture: picture || undefined,
      }))
      .filter((user) => user.email.length > 0);

    return {
      version: parsed.v ?? 1,
      updatedAt: parsed.u ?? 0,
      users,
    };
  } catch {
    return null;
  }
}

export function getUserFromCatalog(
  catalog: UserCatalog,
  userIndex: number | undefined,
): CollaborationUser | null {
  if (userIndex == null || userIndex < 0 || userIndex >= catalog.users.length) {
    return null;
  }
  return catalog.users[userIndex] ?? null;
}

export function initialsFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  const parts = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase();
}

export function registerUserInCatalog(
  catalog: UserCatalog,
  user: CollaborationUser,
): { catalog: UserCatalog; userIndex: number; changed: boolean } {
  const normalizedEmail = user.email.trim().toLowerCase();
  const existingIndex = catalog.users.findIndex(
    (entry) => entry.email.trim().toLowerCase() === normalizedEmail,
  );

  if (existingIndex >= 0) {
    const existing = catalog.users[existingIndex];
    if (!existing) {
      return { catalog, userIndex: existingIndex, changed: false };
    }

    const picture = user.picture ?? existing.picture;
    if (picture === existing.picture) {
      return { catalog, userIndex: existingIndex, changed: false };
    }

    const users = [...catalog.users];
    users[existingIndex] = {
      email: existing.email,
      picture,
    };

    return {
      catalog: {
        ...catalog,
        updatedAt: Math.floor(Date.now() / 1000),
        users,
      },
      userIndex: existingIndex,
      changed: true,
    };
  }

  return {
    catalog: {
      ...catalog,
      updatedAt: Math.floor(Date.now() / 1000),
      users: [
        ...catalog.users,
        {
          email: user.email.trim(),
          picture: user.picture,
        },
      ],
    },
    userIndex: catalog.users.length,
    changed: true,
  };
}

export function mergeUserCatalogs(
  local: UserCatalog,
  remote: UserCatalog,
): { merged: UserCatalog; localChanged: boolean; remoteChanged: boolean } {
  let merged = cloneUserCatalog(local);

  for (const remoteUser of remote.users) {
    merged = registerUserInCatalog(merged, remoteUser).catalog;
  }

  for (const localUser of local.users) {
    merged = registerUserInCatalog(merged, localUser).catalog;
  }

  const mergedPayload = encodeUsersPayload({
    ...merged,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt, merged.updatedAt),
  });
  const localPayload = encodeUsersPayload(local);
  const remotePayload = encodeUsersPayload(remote);

  return {
    merged: {
      ...merged,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt, merged.updatedAt),
    },
    localChanged: mergedPayload !== localPayload,
    remoteChanged: mergedPayload !== remotePayload,
  };
}
