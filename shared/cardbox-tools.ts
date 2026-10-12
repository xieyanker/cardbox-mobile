import type { Card } from "./cardbox";

export function formatCardNumber(value: string) {
  return (
    value
      .replace(/\s/g, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

export function expiryStatus(value: string, now = new Date()) {
  const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value);
  if (!match) return "";
  const end = new Date(
    2000 + Number(match[2]),
    Number(match[1]),
    0,
    23,
    59,
    59,
    999,
  );
  if (end < now) return "已到期";
  return end.getTime() - now.getTime() <= 90 * 86400000 ? "即将到期" : "";
}

export function filterCards(
  cards: Card[],
  query: string,
  type: string,
  favorites: string[],
  onlyFavorites: boolean,
) {
  const needle = query.trim().toLocaleLowerCase();
  const starred = new Set(favorites);
  return cards
    .filter(
      (card) =>
        (type === "all" || card.type === type) &&
        (!onlyFavorites || starred.has(card.id)) &&
        (!needle ||
          card.name.toLocaleLowerCase().includes(needle) ||
          card.number.replace(/\s/g, "").slice(-4).includes(needle)),
    )
    .sort((a, b) => Number(starred.has(b.id)) - Number(starred.has(a.id)));
}

export function moveCardTo(cards: Card[], id: string, target: number) {
  const index = cards.findIndex((card) => card.id === id);
  if (index < 0 || index === target) return cards;
  const next = [...cards];
  const [card] = next.splice(index, 1);
  next.splice(Math.max(0, Math.min(target, next.length)), 0, card);
  return next;
}

/** Keep existing cards on conflicts; imported identities can never overwrite another card. */
export function mergeCards(
  existing: Card[],
  imported: Card[],
  newId: () => string,
) {
  const ids = new Set(existing.map((card) => card.id));
  const numbers = new Set(
    existing.map((card) => card.number.replace(/\s/g, "")),
  );
  const added: Card[] = [];
  for (const card of imported) {
    const number = card.number.replace(/\s/g, "");
    if (numbers.has(number)) continue;
    const id = ids.has(card.id) ? newId() : card.id;
    ids.add(id);
    numbers.add(number);
    added.push({ ...card, id });
  }
  return {
    cards: [...existing, ...added],
    added: added.length,
    skipped: imported.length - added.length,
  };
}
