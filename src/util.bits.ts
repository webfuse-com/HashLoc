// Crockford base32 alphabet (no I, L, O, U).
export const ALPHABET: string = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";


export class BitWriter {
	readonly bits: number[] = [];

	write(value: number, count: number): void {
		for(let bit: number = count - 1; bit >= 0; bit--) {
			this.bits.push(Math.floor(value / 2 ** bit) % 2);
		}
	}
}

export class BitReader {
	private readonly bits: number[];
	private position: number = 0;

	constructor(bits: number[]) {
		this.bits = bits;
	}

	read(count: number): number {
		let value: number = 0;

		for(let bit: number = 0; bit < count; bit++) {
			value = value * 2 + (this.bits[this.position++] ?? 0);
		}

		return value;
	}

	get remaining(): number {
		return this.bits.length - this.position;
	}
}


function symbolIndex(symbol: string): number {
	const index: number = ALPHABET.indexOf(symbol);

	if(index < 0 || symbol.length !== 1) {
		throw new Error(`invalid character '${symbol}'`);
	}

	return index;
}

function luhnSum(text: string, startFactor: number): number {
	const base: number = ALPHABET.length;
	let factor: number = startFactor;
	let sum: number = 0;

	for(let position: number = text.length - 1; position >= 0; position--) {
		let addend: number = factor * symbolIndex(text[position]);

		factor = factor === 2 ? 1 : 2;
		addend = Math.floor(addend / base) + (addend % base);
		sum += addend;
	}

	return sum;
}


export function bitsToBase32(bits: number[]): string {
	let output: string = "";

	for(let offset: number = 0; offset < bits.length; offset += 5) {
		let value: number = 0;

		for(let bit: number = 0; bit < 5; bit++) {
			value = value * 2 + (bits[offset + bit] ?? 0);
		}

		output += ALPHABET[value];
	}

	return output;
}

export function base32ToBits(text: string): number[] {
	const bits: number[] = [];

	for(let position: number = 0; position < text.length; position++) {
		const value: number = symbolIndex(text[position]);

		for(let bit: number = 4; bit >= 0; bit--) {
			bits.push((value >> bit) & 1);
		}
	}

	return bits;
}

// Accept human/LLM-typed variants: case, hyphens, spaces, I/L -> 1, O -> 0.
export function canonicalize(code: string): string {
	return code
		.toUpperCase()
		.replace(/[\s-]/g, "")
		.replace(/[IL]/g, "1")
		.replace(/O/g, "0");
}

// Luhn mod 32 check character: catches every single-character error and most swaps.
export function luhnCheckChar(body: string): string {
	const base: number = ALPHABET.length;

	return ALPHABET[(base - (luhnSum(body, 2) % base)) % base];
}

export function luhnValid(full: string): boolean {
	return luhnSum(full, 1) % ALPHABET.length === 0;
}