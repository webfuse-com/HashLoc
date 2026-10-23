const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
class BitWriter {
  bits = [];
  write(value, count) {
    for (let bit = count - 1; bit >= 0; bit--) {
      this.bits.push(Math.floor(value / 2 ** bit) % 2);
    }
  }
}
class BitReader {
  bits;
  position = 0;
  constructor(bits) {
    this.bits = bits;
  }
  read(count) {
    let value = 0;
    for (let bit = 0; bit < count; bit++) {
      value = value * 2 + (this.bits[this.position++] ?? 0);
    }
    return value;
  }
  get remaining() {
    return this.bits.length - this.position;
  }
}
function symbolIndex(symbol) {
  const index = ALPHABET.indexOf(symbol);
  if (index < 0 || symbol.length !== 1) {
    throw new Error(`invalid character '${symbol}'`);
  }
  return index;
}
function luhnSum(text, startFactor) {
  const base = ALPHABET.length;
  let factor = startFactor;
  let sum = 0;
  for (let position = text.length - 1; position >= 0; position--) {
    let addend = factor * symbolIndex(text[position]);
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / base) + addend % base;
    sum += addend;
  }
  return sum;
}
function bitsToBase32(bits) {
  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    let value = 0;
    for (let bit = 0; bit < 5; bit++) {
      value = value * 2 + (bits[offset + bit] ?? 0);
    }
    output += ALPHABET[value];
  }
  return output;
}
function base32ToBits(text) {
  const bits = [];
  for (let position = 0; position < text.length; position++) {
    const value = symbolIndex(text[position]);
    for (let bit = 4; bit >= 0; bit--) {
      bits.push(value >> bit & 1);
    }
  }
  return bits;
}
function canonicalize(code) {
  return code.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}
function luhnCheckChar(body) {
  const base = ALPHABET.length;
  return ALPHABET[(base - luhnSum(body, 2) % base) % base];
}
function luhnValid(full) {
  return luhnSum(full, 1) % ALPHABET.length === 0;
}
export {
  ALPHABET,
  BitReader,
  BitWriter,
  base32ToBits,
  bitsToBase32,
  canonicalize,
  luhnCheckChar,
  luhnValid
};
