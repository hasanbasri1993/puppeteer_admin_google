const fs = require('fs');
const path = require('path');
const logger = require('pino')();
const adminService = require('../services/adminService');

const IDS_PATH = path.join(process.cwd(), 'ids.json');
const IDS_BACKUP_PATH = path.join(process.cwd(), 'ids.backup.json');
const REQUIRED_FIELDS = ['ID_GOOGLE', 'NIS', 'KELAS', 'NAMA'];

function validateIdsData(data) {
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('File harus berisi array JSON yang tidak kosong');
    }

    data.forEach((item, index) => {
        if (typeof item !== 'object' || item === null) {
            throw new Error(`Data pada baris ${index + 1} bukan objek`);
        }
        for (const field of REQUIRED_FIELDS) {
            if (!(field in item)) {
                throw new Error(`Data pada baris ${index + 1} tidak memiliki field "${field}"`);
            }
        }
    });
}

module.exports = {
    listAdmins: (req, res) => {
        res.json({success: true, admins: adminService.getAdmins()});
    },

    addAdmin: (req, res) => {
        try {
            const {email} = req.body;
            const admins = adminService.addAdmin(email);
            logger.info(`Admin added: ${email}`);
            res.json({success: true, admins});
        } catch (error) {
            res.status(400).json({success: false, error: error.message});
        }
    },

    removeAdmin: (req, res) => {
        try {
            const {email} = req.body;
            const admins = adminService.removeAdmin(email);
            logger.info(`Admin removed: ${email}`);
            res.json({success: true, admins});
        } catch (error) {
            res.status(400).json({success: false, error: error.message});
        }
    },

    uploadIds: (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({success: false, error: 'File ids.json diperlukan'});
            }

            let data;
            try {
                data = JSON.parse(req.file.buffer.toString('utf8'));
            } catch (err) {
                return res.status(400).json({success: false, error: 'File bukan JSON yang valid'});
            }

            validateIdsData(data);

            // Keep a single-slot backup of the previous file before replacing it
            if (fs.existsSync(IDS_PATH)) {
                fs.copyFileSync(IDS_PATH, IDS_BACKUP_PATH);
            }

            fs.writeFileSync(IDS_PATH, JSON.stringify(data, null, 2));

            const actorEmail = req.user?.emails?.[0]?.value || 'unknown';
            logger.info(`ids.json replaced with ${data.length} records by ${actorEmail}`);

            res.json({
                success: true,
                message: `ids.json berhasil diperbarui dengan ${data.length} data`,
                count: data.length
            });
        } catch (error) {
            logger.error('Error uploading ids.json:', error.message);
            res.status(400).json({success: false, error: error.message});
        }
    }
};
