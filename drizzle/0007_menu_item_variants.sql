-- Phase 2: first-class sizes/variants for menu items.
-- `menu_item.price` remains the searchable starting price and is synchronized
-- from the lowest available variant by the application.

CREATE TABLE IF NOT EXISTS menu_item_variant (
  id INT NOT NULL AUTO_INCREMENT,
  item_id INT NOT NULL,
  label VARCHAR(120) NOT NULL,
  price INT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  price_updated_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT menu_item_variant_id PRIMARY KEY (id),
  CONSTRAINT menu_item_variant_item_id_fk FOREIGN KEY (item_id)
    REFERENCES menu_item(id) ON DELETE CASCADE,
  UNIQUE INDEX menu_item_variant_label_uq (item_id, label),
  INDEX menu_item_variant_item_idx (item_id, sort_order)
) ENGINE=InnoDB;

-- هم‌زمانی دو submit نباید یک تصویر را دوبار به گالری همان شعبه وصل کند.
ALTER TABLE place_photo
  ADD UNIQUE INDEX IF NOT EXISTS place_photo_media_uq (place_id, media_id);

ALTER TABLE place
  ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 0 AFTER updated_at,
  ALGORITHM=INPLACE, LOCK=SHARED;
