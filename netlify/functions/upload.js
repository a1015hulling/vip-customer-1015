const busboy = require('busboy');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// Netlify Function 收到的是 Lambda 風格的 event（body 是字串，二進位內容會是 base64），
// 這裡用 busboy 把 multipart/form-data 解析成「檔案內容」。
function parseMultipartFile(event) {
    return new Promise((resolve, reject) => {
        const contentType = event.headers['content-type'] || event.headers['Content-Type'];
        if (!contentType || !contentType.includes('multipart/form-data')) {
            reject(new Error('Content-Type 不是 multipart/form-data'));
            return;
        }

        const bb = busboy({ headers: { 'content-type': contentType } });
        let fileBuffer = null;
        let fileFound = false;

        bb.on('file', (fieldname, fileStream) => {
            fileFound = true;
            const chunks = [];
            fileStream.on('data', (chunk) => chunks.push(chunk));
            fileStream.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });

        bb.on('error', (err) => reject(err));

        bb.on('finish', () => {
            if (!fileFound || !fileBuffer) {
                reject(new Error('沒有在表單裡找到檔案'));
                return;
            }
            resolve(fileBuffer);
        });

        const bodyBuffer = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
        bb.end(bodyBuffer);
    });
}

// Excel 裡如果有合併儲存格（例如「姓名」欄把兩列合併成一格顯示同一個人），
// SheetJS 預設只會把值放在合併範圍「最左上角」那一格，範圍內其他列讀起來會是空的。
// 這裡把合併範圍左上角的值，複製貼到範圍內的每一格，讀出來的每一列資料才會是完整的。
function fillMergedCells(sheet) {
    const merges = sheet['!merges'];
    if (!merges || merges.length === 0) {
        return;
    }

    merges.forEach(merge => {
        const startAddress = xlsx.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
        const startCell = sheet[startAddress];
        if (!startCell) {
            return;
        }

        for (let row = merge.s.r; row <= merge.e.r; row++) {
            for (let col = merge.s.c; col <= merge.e.c; col++) {
                const address = xlsx.utils.encode_cell({ r: row, c: col });
                if (!sheet[address]) {
                    sheet[address] = { ...startCell };
                }
            }
        }
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: '只接受 POST' }) };
    }

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 密碼放在自訂 header 裡
    const password = event.headers['x-admin-password'] || event.headers['X-Admin-Password'];
    if (!password || password !== ADMIN_PASSWORD) {
        return { statusCode: 401, body: JSON.stringify({ error: '密碼錯誤，無法上傳' }) };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return { statusCode: 500, body: JSON.stringify({ error: '後端尚未設定 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }) };
    }

    let fileBuffer;
    try {
        fileBuffer = await parseMultipartFile(event);
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: '無法解析上傳的檔案：' + err.message }) };
    }

    let rows;
    try {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        fillMergedCells(sheet);
        rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: '解析 Excel 失敗，請確認檔案格式是否正確（.xlsx / .xls）' }) };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: '這個 Excel 檔案讀不到任何資料' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        // 先清空舊資料，id 是從 1 開始的自動編號，所以「大於 0」等於「全部」
        const { error: deleteError } = await supabase.from('contacts').delete().gt('id', 0);
        if (deleteError) throw deleteError;

        // 再整批寫入新資料，每一列都包成 { data: {...這一筆的所有欄位...} }
        const rowsToInsert = rows.map(row => ({ data: row }));
        const { error: insertError } = await supabase.from('contacts').insert(rowsToInsert);
        if (insertError) throw insertError;

        return { statusCode: 200, body: JSON.stringify({ ok: true, count: rows.length }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: '上傳失敗：' + (err.message || '請確認資料庫設定') }) };
    }
};
