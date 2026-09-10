const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: '後端尚未設定 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }),
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        const { data, error } = await supabase
            .from('contacts')
            .select('data')
            .order('id', { ascending: true });

        if (error) {
            throw error;
        }

        // 資料庫每一列存的是 { data: {...這一筆聯絡人的完整欄位...} }，這裡把它攤平成陣列
        const contacts = data.map(row => row.data);

        return {
            statusCode: 200,
            body: JSON.stringify(contacts),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: '讀取資料失敗，請確認資料庫設定是否正確' }),
        };
    }
};
