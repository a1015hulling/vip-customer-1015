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
        // Supabase / PostgREST 單次查詢預設最多只會回傳 1000 筆，
        // 資料超過 1000 筆時，後面的資料會被自動截斷、且不會有任何錯誤訊息。
        // 這裡改成用 .range() 每批撈 1000 筆，撈到「這批筆數 < 1000」代表已經到底，
        // 再把所有批次合併起來，確保不管有幾筆資料都能完整取回。
        const PAGE_SIZE = 1000;
        let allRows = [];
        let from = 0;

        while (true) {
            const to = from + PAGE_SIZE - 1;
            const { data, error } = await supabase
                .from('contacts')
                .select('data')
                .order('id', { ascending: true })
                .range(from, to);

            if (error) {
                throw error;
            }

            allRows = allRows.concat(data);

            if (!data || data.length < PAGE_SIZE) {
                break;
            }
            from += PAGE_SIZE;
        }

        // 資料庫每一列存的是 { data: {...這一筆聯絡人的完整欄位...} }，這裡把它攤平成陣列
        const contacts = allRows.map(row => row.data);

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
