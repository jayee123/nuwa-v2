-- 015: App 註冊表加 admin_url（各 App 的課程後台入口），讓 Market 後台一目瞭然
--
-- happy 的課程後台在 nexthappy.sakilu-dev.uk/admin（App 層，Steve 的課程後台）。

ALTER TABLE apps ADD COLUMN IF NOT EXISTS admin_url TEXT;

UPDATE apps SET admin_url = 'https://nexthappy.sakilu-dev.uk/admin'
WHERE slug = 'happy' AND (admin_url IS NULL OR admin_url = '');
