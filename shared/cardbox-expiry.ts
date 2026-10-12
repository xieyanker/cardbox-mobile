const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** The mask is display-only; persisted values remain empty or MM/YY. */
export function expiryInputMask(value: string): string {
  const digits = digitsOnly(value).slice(0, 4).padEnd(4, "_");
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

type Selection = { start: number; end: number };

/** Apply a native single-input edit while keeping the separator out of storage. */
export function editExpiryInput(
  previous: string,
  text: string,
  selection: Selection,
): { value: string; selection: Selection; error?: string } {
  const mask = expiryInputMask(previous);
  let start = 0;
  while (start < mask.length && mask[start] === text[start]) start++;
  let end = mask.length;
  let textEnd = text.length;
  while (
    end > start &&
    textEnd > start &&
    mask[end - 1] === text[textEnd - 1]
  ) {
    end--;
    textEnd--;
  }

  // Prefer the actual selection when repeated digits make the diff ambiguous.
  const insertedLength =
    text.length - (mask.length - (selection.end - selection.start));
  if (
    insertedLength >= 0 &&
    text.slice(0, selection.start) === mask.slice(0, selection.start) &&
    text.slice(selection.start + insertedLength) === mask.slice(selection.end)
  ) {
    start = selection.start;
    end = selection.end;
    textEnd = start + insertedLength;
  }
  if (selection.start === selection.end && text.length === mask.length - 1) {
    const cursor = selection.start;
    if (cursor > 0 && text === mask.slice(0, cursor - 1) + mask.slice(cursor)) {
      start = cursor - 1;
      end = cursor;
      textEnd = start;
    } else if (text === mask.slice(0, cursor) + mask.slice(cursor + 1)) {
      start = cursor;
      end = cursor + 1;
      textEnd = start;
    }
  }
  let inserted = digitsOnly(text.slice(start, textEnd));
  const remaining = digitsOnly(mask.slice(0, start) + mask.slice(end));
  if (
    inserted.length === 6 &&
    remaining.length === 0 &&
    /^\d{2}20\d{2}$/.test(inserted)
  ) {
    inserted = inserted.slice(0, 2) + inserted.slice(4);
  } else if (inserted.length > 4 || remaining.length + inserted.length > 4) {
    // A fifth key at the end is ignored; a long paste must never change the year silently.
    if (inserted.length === 1 && remaining.length === 4) {
      // Retain normal insertion-in-the-middle behavior; ignore an extra trailing key.
      if (start < 5) {
        const digits = (
          digitsOnly(mask.slice(0, start)) +
          inserted +
          digitsOnly(mask.slice(end))
        ).slice(0, 4);
        const cursor = Math.min(digitsOnly(mask.slice(0, start)).length + 1, 4);
        return {
          value: `${digits.slice(0, 2)}/${digits.slice(2)}`,
          selection: {
            start: cursor < 2 ? cursor : cursor + 1,
            end: cursor < 2 ? cursor : cursor + 1,
          },
        };
      }
      return { value: previous, selection: { ...selection } };
    }
    return {
      value: previous,
      selection: { ...selection },
      error: "请输入 MM/YY，或粘贴 MM/YYYY（20xx 年）。",
    };
  }

  // Backspace/Delete on the fixed slash removes the adjacent digit instead.
  if (mask.slice(start, end) === "/" && textEnd === start) {
    if (selection.start > 2) start--;
    else end++;
  }

  const before = digitsOnly(mask.slice(0, start));
  const after = digitsOnly(mask.slice(end));
  const digits = (before + inserted + after).slice(0, 4);
  const value =
    digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  const offset = Math.min(before.length + inserted.length, digits.length);
  const cursor = offset < 2 ? offset : offset + 1;
  return { value, selection: { start: cursor, end: cursor } };
}
