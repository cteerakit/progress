export interface SignedInUserProfile {
  email: string;
  picture?: string;
}

export async function fetchSignedInUserProfile(
  token: string,
): Promise<SignedInUserProfile | null> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { email?: string; picture?: string };
  if (!data.email) {
    return null;
  }

  return {
    email: data.email,
    picture: data.picture,
  };
}

export async function fetchSignedInEmail(token: string): Promise<string | null> {
  const profile = await fetchSignedInUserProfile(token);
  return profile?.email ?? null;
}
