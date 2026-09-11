const { createClient } = require('@supabase/supabase-js');

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

    // 前端（admin.html）現在會先在瀏覽器端把使用者選取的一個或多個 Excel 檔案
    // 自己解析、合併成一份資料，再用 JSON 格式送過來，格式是 { rows: [ {...}, {...}, ... ] }
    let rows;
    try {
        const bodyText = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : (event.body || '');
        const parsedBody = JSON.parse(bodyText);
        rows = parsedBody.rows;
    } catch (err) {
        return { statusCode: 400, body: JSON.stringify({ error: '無法解析上傳的內容，格式應為 JSON：' + err.message }) };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: '沒有收到任何資料列' }) };
    }

    // 前端會用 x-upload-mode 這個 header 告訴後端：
    // 'append' = 保留資料庫裡原本的資料，這次送來的資料用「新增」的方式疊加上去
    // 'replace'（或沒帶這個 header）= 先清空舊資料，再整批寫入這次送來的資料
    const uploadMode = event.headers['x-upload-mode'] || event.headers['X-Upload-Mode'] || 'replace';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        if (uploadMode !== 'append') {
            // 先清空舊資料，id 是從 1 開始的自動編號，所以「大於 0」等於「全部」
            const { error: deleteError } = await supabase.from('contacts').delete().gt('id', 0);
            if (deleteError) throw deleteError;
        }

        // 再整批寫入資料，每一列都包成 { data: {...這一筆的所有欄位...} }
        const rowsToInsert = rows.map(row => ({ data: row }));
        const { error: insertError } = await supabase.from('contacts').insert(rowsToInsert);
        if (insertError) throw insertError;

        return { statusCode: 200, body: JSON.stringify({ ok: true, count: rows.length }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: '上傳失敗：' + (err.message || '請確認資料庫設定') }) };
    }
};
