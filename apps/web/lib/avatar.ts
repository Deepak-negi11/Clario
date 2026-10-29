

export const CHARACTERS = ["adam", "alex", "bob", "amelia"] as const;
export type CharacterKey = (typeof CHARACTERS)[number];



export function charFromImageUrl(url: string | null | undefined): CharacterKey {
  const match = url?.match(/\/assets\/(adam|alex|bob|amelia)-run\.png$/);
  return (match?.[1] as CharacterKey) ?? "adam";
}
