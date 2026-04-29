class MSGPackDecoder {
    constructor(buffer) {
        this.off = 0;
        this.bytes = new Uint8Array(buffer);
        this.view  = new DataView(buffer);
        this.textDecoder = new TextDecoder();
    }

    advance(bytes) {
        this.off = bytes;
    }

    peak() { return this.bytes[this.off]; }
    
    readU8() { return this.bytes[this.off++]; }
    
    readI8() { return (this.bytes[this.off++] << 24) >> 24; }

    readU16() {
        const b = this.bytes;
        let o = this.off;
        const b0 = b[o++];
        const b1 = b[o++];
        this.off = o;
        return b0 | (b1 << 8);
    }

    readI16() {
        const b = this.bytes;
        let o = this.off;
        const b0 = b[o++];
        const b1 = b[o++];
        this.off = o;
        const v = b0 | (b1 << 8);
        return (v << 16) >> 16;
    }

    readU32() {
        const b = this.bytes;
            let o = this.off;
            const b0 = b[o++];
            const b1 = b[o++];
            const b2 = b[o++];
            const b3 = b[o++];
        this.off = o;
        return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
    }

    readI32() {
        const b = this.bytes;
        let o = this.off;
        const b0 = b[o++];
        const b1 = b[o++];
        const b2 = b[o++];
        const b3 = b[o++];
        this.off = o;
        return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) | 0;
    }

    readU64() {
        const b = this.bytes;
        let o = this.off;

        const b0 = b[o++];
        const b1 = b[o++];
        const b2 = b[o++];
        const b3 = b[o++];
        const b4 = b[o++];
        const b5 = b[o++];
        const b6 = b[o++];
        const b7 = b[o++];

        this.off = o;

        const low  = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
        const high = b4 | (b5 << 8) | (b6 << 16) | (b7 << 24);
        const value = high * 2 ** 32 + (low >>> 0);

        if (high >= 0x200000) {
            console.warn("readU64: value exceeds Number.MAX_SAFE_INTEGER, precision may be lost");
        }

        return value;
    }

    readI64() {
        const v = this.readU64();
        return v > 0x7FFFFFFFFFFFFFFFn ? v - 0x10000000000000000n : v;
    }

    readF32() {
        const v = this.view.getFloat32(this.off, true);
        this.off += 4;
        return v;
    }

    readF64() {
        const v = this.view.getFloat64(this.off, true);
        this.off += 8;
        return v;
    }

    readString(len) {
        const s = this.off;
        const e = s + len;
        this.off = e;
        return this.textDecoder.decode(this.bytes.subarray(s, e));
    }
    
    readArray(len) {
        const arr = new Array(len);
        for (let i = 0; i < len; i++) arr[i] = this.decode();
        return arr;
    }

    readMap(len) {
        const map = {};
        for (let i = 0; i < len; i++) {
            const key = this.decode();
            const value = this.decode();
            map[key] = value;
        }
        return map;
    }

    // Ext formats
    readExt(len) {
        const type = this.readU8();
        throw new Error(`Unsupported ext: ${typeof(type)} ${type}`);
    }

    decode() {
        const byte = this.readU8();

        // positive fixint (0x00 - 0x7f)
        if (byte <= 0x7f) return byte;

        // negative fixint (0xe0 - 0xff)
        if (byte >= 0xe0) return byte - 0x100;

        // fixmap (0x80 - 0x8f)
        if ((byte & 0xf0) === 0x80) return this.readMap(byte & 0x0f);

        // fixarray (0x90 - 0x9f)
        if ((byte & 0xf0) === 0x90) return this.readArray(byte & 0x0f);

        // fixstr (0xa0 - 0xbf)
        if ((byte & 0xe0) === 0xa0) return this.readString(byte & 0x1f);

        switch (byte) {
            case 0xc0: return null;
            case 0xc2: return false;
            case 0xc3: return true;
            // map
            case 0xde: return this.readMap(this.readU16());
            case 0xdf: return this.readMap(this.readU32());
            // array
            case 0xdc: return this.readArray(this.readU16());
            case 0xdd: return this.readArray(this.readU32());
            // str
            case 0xd9: return this.readString(this.readU8());
            case 0xda: return this.readString(this.readU16());
            case 0xdb: return this.readString(this.readU32());
            // uint
            case 0xcc: return this.readU8();
            case 0xcd: return this.readU16();
            case 0xce: return this.readU32();
            case 0xcf: return this.readU64();
            // int
            case 0xd0: return this.readI8();
            case 0xd1: return this.readI16();
            case 0xd2: return this.readI32();
            case 0xd3: return this.readI64();
            // ext
            case 0xd4: return this.readExt(1);
            case 0xd5: return this.readExt(2);
            case 0xd6: return this.readExt(4);
            case 0xd7: return this.readExt(8);
            case 0xd8: return this.readExt(16);
            case 0xc7: return this.readExt(this.readU8());
            case 0xc8: return this.readExt(this.readU16());
            case 0xc9: return this.readExt(this.readU32());
            // float
            case 0xca: return this.readF32();
            case 0xcb: return this.readF64();
        }

        throw new Error(`Unsupported byte: 0x${byte.toString(16)}`);
    }
}