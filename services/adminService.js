const fs = require('fs');
const path = require('path');

const ADMINS_PATH = path.join(process.cwd(), 'admins.json');
const DEFAULT_ADMIN = 'hasanbasri@daarululuumlido.com';
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const normalize = (email) => String(email || '').trim().toLowerCase();

function save(admins) {
    fs.writeFileSync(ADMINS_PATH, JSON.stringify(admins, null, 2));
}

function load() {
    try {
        const admins = JSON.parse(fs.readFileSync(ADMINS_PATH, 'utf8'));
        if (Array.isArray(admins) && admins.length > 0) {
            return admins;
        }
    } catch (err) {
        // Missing or invalid file - seed with the default admin below.
    }
    const seeded = [DEFAULT_ADMIN];
    save(seeded);
    return seeded;
}

function getAdmins() {
    return load();
}

function isAdmin(email) {
    return load().includes(normalize(email));
}

function addAdmin(email) {
    const normalized = normalize(email);
    if (!EMAIL_REGEX.test(normalized)) {
        throw new Error('Format email tidak valid');
    }

    const admins = load();
    if (admins.includes(normalized)) {
        throw new Error('Email sudah terdaftar sebagai admin');
    }

    admins.push(normalized);
    save(admins);
    return admins;
}

function removeAdmin(email) {
    const normalized = normalize(email);
    const admins = load();

    if (!admins.includes(normalized)) {
        throw new Error('Email tidak ditemukan di daftar admin');
    }
    if (admins.length <= 1) {
        throw new Error('Tidak dapat menghapus admin terakhir');
    }

    const updated = admins.filter((admin) => admin !== normalized);
    save(updated);
    return updated;
}

module.exports = {
    getAdmins,
    isAdmin,
    addAdmin,
    removeAdmin
};
