export declare const ALPHABET: string;
export declare class BitWriter {
    readonly bits: number[];
    write(value: number, count: number): void;
}
export declare class BitReader {
    private readonly bits;
    private position;
    constructor(bits: number[]);
    read(count: number): number;
    get remaining(): number;
}
export declare function bitsToBase32(bits: number[]): string;
export declare function base32ToBits(text: string): number[];
export declare function canonicalize(code: string): string;
export declare function luhnCheckChar(body: string): string;
export declare function luhnValid(full: string): boolean;
