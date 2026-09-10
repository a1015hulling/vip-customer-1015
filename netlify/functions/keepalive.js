const { createClient } = require('@supabase/supabase-js');

// 這支 function 不對外開放使用，純粹是「排程」用的：
// 每天固定時間跑一次，向 Supabase 查一筆資料，
// 讓 Supabase 認定這個專案「有在使用」，避免 7 天沒動靜就被自動暫停。
exports.handler = async () => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('keepalive：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
        return { statusCode: 500, body: JSON.stringify({ error: '環境變數未設定' }) };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        const { error } = await supabase.from('contacts').select('id').limit(1);
        if (error) throw error;

        console.log('keepalive：成功呼叫 Supabase，避免專案被自動暫停');
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
        console.error('keepalive 失敗：', err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
