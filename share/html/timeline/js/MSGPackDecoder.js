class MSGPackDecoder {
    constructor(binstr) {
        this.off = 0;
        this.bytes = binstr;
        
        this._buf8 = new ArrayBuffer(8);
        this._u8 = new Uint8Array(this._buf8);
        this._view = new DataView(this._buf8);

        this.textDecoder = new TextDecoder();
    }

    advance(bytes) {
        if (bytes < 0) {
            this.off = this.bytes.length + bytes;
        } else {
            this.off = bytes;
        }
    }

    peak() { return this.bytes.charCodeAt(this.off); }
    
    readU8() { return this.bytes.charCodeAt(this.off++); }
    
    readI8() { return (this.readU8() << 24) >> 24; }

    readU16() {
        const b0 = this.readU8();
        const b1 = this.readU8();
        return b0 | (b1 << 8);
    }

    readI16() {
        const b0 = this.readU8();
        const b1 = this.readU8();
        const v = b0 | (b1 << 8);
        return (v << 16) >> 16;
    }

    readU32() {
        const b0 = this.readU8();
        const b1 = this.readU8();
        const b2 = this.readU8();
        const b3 = this.readU8();
        return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
    }

    readI32() {
        const b0 = this.readU8();
        const b1 = this.readU8();
        const b2 = this.readU8();
        const b3 = this.readU8();
        return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) | 0;
    }

    readU64() {
        const b0 = this.readU8();
        const b1 = this.readU8();
        const b2 = this.readU8();
        const b3 = this.readU8();
        const b4 = this.readU8();
        const b5 = this.readU8();
        const b6 = this.readU8();
        const b7 = this.readU8();
        const low  = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
        const high = b4 | (b5 << 8) | (b6 << 16) | (b7 << 24);
        const value = high * 2 ** 32 + (low >>> 0);

        if (high >= 0x200000) {
            console.warn("readU64: value exceeds Number.MAX_SAFE_INTEGER, precision may be lost");
        }

        return value;
    }

    readI64() {
        const b0 = this.readU8();
        const b1 = this.readU8();
        const b2 = this.readU8();
        const b3 = this.readU8();
        const b4 = this.readU8();
        const b5 = this.readU8();
        const b6 = this.readU8();
        const b7 = this.readU8();

        const low  = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
        const high = (b4 | (b5 << 8) | (b6 << 16) | (b7 << 24)) >>> 0;

        let value = high * 2 ** 32 + low;

        // if sign bit is set (negative number in int64)
        if (high & 0x80000000) {
            value -= 2 ** 64;
        }

        return value;
    }

    readF32() {
        this._u8[0] = this.readU8();
        this._u8[1] = this.readU8();
        this._u8[2] = this.readU8();
        this._u8[3] = this.readU8();
        return this._view.getFloat32(0, true);
    }

    readF64() {
        this._u8[0] = this.readU8();
        this._u8[1] = this.readU8();
        this._u8[2] = this.readU8();
        this._u8[3] = this.readU8();
        this._u8[4] = this.readU8();
        this._u8[5] = this.readU8();
        this._u8[6] = this.readU8();
        this._u8[7] = this.readU8();
        return this._view.getFloat64(0, true);
    }

    readString(len) {
        const s = this.off;
        const e = s + len;
        this.off = e;
        return this.bytes.slice(s, e);
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