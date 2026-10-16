-- ============================================================================
-- Seed data: categories + per-category detail templates (dev/staging only for
-- demo rows; categories themselves also ship to prod).
-- ============================================================================

insert into public.categories (slug, name_i18n, sort_order) values
  ('phones',       '{"th":"มือถือ/แท็บเล็ต","en":"Phones & Tablets","zh":"手机/平板"}', 1),
  ('electronics',  '{"th":"เครื่องใช้ไฟฟ้า/อิเล็กทรอนิกส์","en":"Electronics","zh":"电子产品"}', 2),
  ('computers',    '{"th":"คอมพิวเตอร์","en":"Computers","zh":"电脑"}', 3),
  ('fashion',      '{"th":"เสื้อผ้า/แฟชั่น","en":"Fashion","zh":"服饰"}', 4),
  ('home',         '{"th":"บ้านและเฟอร์นิเจอร์","en":"Home & Furniture","zh":"家居家具"}', 5),
  ('vehicles',     '{"th":"ยานพาหนะ/อะไหล่","en":"Vehicles & Parts","zh":"车辆配件"}', 6),
  ('collectibles', '{"th":"ของสะสม/พระเครื่อง","en":"Collectibles","zh":"收藏品"}', 7),
  ('books',        '{"th":"หนังสือ","en":"Books","zh":"书籍"}', 8),
  ('other',        '{"th":"อื่น ๆ","en":"Other","zh":"其他"}', 99);

-- Detail template example: phones — these fields are what the buyer checks
-- against at the inspection gate ("ของต้องตรงตามประกาศ").
insert into public.category_fields (category_id, key, label_i18n, type, options, required, sort_order)
select c.id, f.key, f.label_i18n::jsonb, f.type, f.options::jsonb, f.required, f.sort_order
from public.categories c
join (values
  ('phones', 'brand',   '{"th":"ยี่ห้อ","en":"Brand","zh":"品牌"}', 'text',   null, true,  1),
  ('phones', 'model',   '{"th":"รุ่น","en":"Model","zh":"型号"}',   'text',   null, true,  2),
  ('phones', 'storage', '{"th":"ความจุ","en":"Storage","zh":"容量"}','select',
     '["64GB","128GB","256GB","512GB","1TB"]', true, 3),
  ('phones', 'battery_health', '{"th":"สุขภาพแบตเตอรี่ (%)","en":"Battery health (%)","zh":"电池健康度 (%)"}',
     'number', null, false, 4),
  ('computers', 'brand', '{"th":"ยี่ห้อ","en":"Brand","zh":"品牌"}', 'text',  null, true,  1),
  ('computers', 'cpu',   '{"th":"ซีพียู","en":"CPU","zh":"处理器"}', 'text',  null, false, 2),
  ('computers', 'ram',   '{"th":"แรม","en":"RAM","zh":"内存"}',      'select',
     '["4GB","8GB","16GB","32GB","64GB"]', false, 3),
  ('vehicles',  'year',    '{"th":"ปี","en":"Year","zh":"年份"}',    'number', null, true,  1),
  ('vehicles',  'mileage', '{"th":"เลขไมล์ (กม.)","en":"Mileage (km)","zh":"里程 (公里)"}',
     'number', null, false, 2)
) as f(category_slug, key, label_i18n, type, options, required, sort_order)
  on f.category_slug = c.slug;
