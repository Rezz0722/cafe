-- آیتم‌های سفارش‌شده در هر نظر؛ یک نظر می‌تواند چند آیتم از همان شعبه داشته باشد.
CREATE TABLE IF NOT EXISTS review_item (
  review_id INT NOT NULL,
  menu_item_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, menu_item_id),
  CONSTRAINT review_item_review_id_fk FOREIGN KEY (review_id)
    REFERENCES review(id) ON DELETE CASCADE,
  CONSTRAINT review_item_menu_item_id_fk FOREIGN KEY (menu_item_id)
    REFERENCES menu_item(id) ON DELETE CASCADE,
  INDEX review_item_menu_item_idx (menu_item_id)
) ENGINE=InnoDB;
