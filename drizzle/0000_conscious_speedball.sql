CREATE TABLE `app_user` (
	`id` char(36) NOT NULL,
	`phone` varchar(16),
	`username` varchar(64),
	`email` varchar(160),
	`name` varchar(120) NOT NULL DEFAULT '',
	`role` enum('customer','owner','admin') NOT NULL DEFAULT 'customer',
	`status` enum('active','blocked') NOT NULL DEFAULT 'active',
	`password_hash` varchar(255),
	`password_updated_at` timestamp,
	`must_change_password` boolean NOT NULL DEFAULT false,
	`avatar_media_id` int,
	`last_lat` decimal(10,7),
	`last_lng` decimal(10,7),
	`failed_logins` tinyint NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_login_at` timestamp,
	`created_by_user_id` char(36),
	CONSTRAINT `app_user_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_user_phone_uq` UNIQUE(`phone`),
	CONSTRAINT `app_user_username_uq` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `attribute` (
	`id` varchar(48) NOT NULL,
	`label_fa` varchar(120) NOT NULL,
	`kind` enum('intent','amenity','vibe') NOT NULL,
	`is_filter` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`hint` varchar(255),
	CONSTRAINT `attribute_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`actor_user_id` char(36),
	`actor_label` varchar(120) NOT NULL DEFAULT '',
	`action` varchar(64) NOT NULL,
	`entity` varchar(64) NOT NULL,
	`entity_id` varchar(64) NOT NULL,
	`before` json,
	`after` json,
	`ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`method` enum('otp','password','impersonation') NOT NULL,
	`ip` varchar(64),
	`user_agent` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	CONSTRAINT `auth_session_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_stat` (
	`day` date NOT NULL,
	`metric` varchar(64) NOT NULL,
	`ref_id` varchar(64) NOT NULL DEFAULT '',
	`value` int NOT NULL DEFAULT 0,
	CONSTRAINT `daily_stat_day_metric_ref_id_pk` PRIMARY KEY(`day`,`metric`,`ref_id`)
);
--> statement-breakpoint
CREATE TABLE `dish` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name_fa` varchar(120) NOT NULL,
	`name_en` varchar(120),
	`facet_id` varchar(48),
	`is_popular` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`place_count` int NOT NULL DEFAULT 0,
	`item_count` int NOT NULL DEFAULT 0,
	`min_price` int,
	`median_price` int,
	CONSTRAINT `dish_id` PRIMARY KEY(`id`),
	CONSTRAINT `dish_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `dish_alias` (
	`alias` varchar(120) NOT NULL,
	`dish_id` int NOT NULL,
	CONSTRAINT `dish_alias_alias` PRIMARY KEY(`alias`)
);
--> statement-breakpoint
CREATE TABLE `district` (
	`id` varchar(48) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`center_lat` decimal(10,7) NOT NULL,
	`center_lng` decimal(10,7) NOT NULL,
	`radius_m` int NOT NULL DEFAULT 1200,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `district_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `edit_suggestion` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`user_id` char(36),
	`field` varchar(64) NOT NULL,
	`current_value` text,
	`suggested_value` text NOT NULL,
	`status` enum('pending','applied','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by_user_id` char(36),
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `edit_suggestion_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `facet` (
	`id` varchar(48) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`label_fa` varchar(120) NOT NULL,
	`label_en` varchar(120),
	`kind` enum('menu','cuisine','drink','service') NOT NULL,
	`is_filter` boolean NOT NULL DEFAULT true,
	`is_popular` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`icon` varchar(32),
	`hint` varchar(255),
	`place_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `facet_id` PRIMARY KEY(`id`),
	CONSTRAINT `facet_slug_uq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `impersonation_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`admin_user_id` char(36) NOT NULL,
	`target_user_id` char(36),
	`target_place_id` int,
	`reason` varchar(255),
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`ended_at` timestamp,
	CONSTRAINT `impersonation_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url_hash` char(40) NOT NULL,
	`source_url` varchar(700) NOT NULL,
	`local_path` varchar(300),
	`kind` enum('logo','menu_item','menu_section','place_photo','avatar','upload') NOT NULL,
	`format` varchar(8),
	`width` int,
	`height` int,
	`bytes` int,
	`content_hash` char(64),
	`status` enum('pending','ok','failed','skipped') NOT NULL DEFAULT 'pending',
	`attempts` tinyint NOT NULL DEFAULT 0,
	`error` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`fetched_at` timestamp,
	CONSTRAINT `media_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_url_hash_uq` UNIQUE(`url_hash`)
);
--> statement-breakpoint
CREATE TABLE `menu_item` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`section_id` int NOT NULL,
	`source_id` int,
	`name` varchar(250) NOT NULL,
	`name_en` varchar(250),
	`name_normalized` varchar(250) NOT NULL,
	`description` text,
	`price` int,
	`price_unknown` boolean NOT NULL DEFAULT false,
	`available` boolean NOT NULL DEFAULT true,
	`featured` boolean NOT NULL DEFAULT false,
	`media_id` int,
	`dish_id` int,
	`sort_order` int NOT NULL DEFAULT 0,
	`price_updated_at` timestamp,
	CONSTRAINT `menu_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_section` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`name_en` varchar(200),
	`description` text,
	`media_id` int,
	`facet_id` varchar(48),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `menu_section_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `otp_code` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(16) NOT NULL,
	`code_hash` varchar(255) NOT NULL,
	`purpose` enum('login','verify_phone','reset_password') NOT NULL DEFAULT 'login',
	`attempts` tinyint NOT NULL DEFAULT 0,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `otp_code_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `page_view` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`path` varchar(300) NOT NULL,
	`place_id` int,
	`user_id` char(36),
	`visitor_id` char(36),
	`referrer` varchar(500),
	`device` enum('mobile','tablet','desktop','bot','unknown') NOT NULL DEFAULT 'unknown',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_view_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `place` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(140) NOT NULL,
	`source_id` int,
	`source_username` varchar(140),
	`name` varchar(200) NOT NULL,
	`name_en` varchar(200),
	`name_normalized` varchar(200) NOT NULL,
	`kind` enum('cafe','cafe_restaurant','restaurant','bakery','lounge','shop') NOT NULL DEFAULT 'cafe',
	`status` enum('draft','published','temporarily_closed','permanently_closed','merged') NOT NULL DEFAULT 'draft',
	`merged_into` int,
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`geo_status` enum('ok','out_of_area','missing') NOT NULL DEFAULT 'missing',
	`address` varchar(500) NOT NULL DEFAULT '',
	`district_id` varchar(48),
	`price_tier` tinyint NOT NULL DEFAULT 2,
	`price_min` int,
	`price_median` int,
	`price_max` int,
	`price_unit_fixed` boolean NOT NULL DEFAULT false,
	`menu_url` varchar(500),
	`instagram` varchar(120),
	`about` text,
	`logo_media_id` int,
	`cover_media_id` int,
	`rating_sum` int NOT NULL DEFAULT 0,
	`rating_count` int NOT NULL DEFAULT 0,
	`ribbon` varchar(80),
	`signature_item` varchar(200),
	`quality_score` tinyint NOT NULL DEFAULT 0,
	`view_count` int NOT NULL DEFAULT 0,
	`source` enum('import','field_visit','owner','user','instagram','inferred') NOT NULL DEFAULT 'import',
	`last_verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_by_user_id` char(36),
	CONSTRAINT `place_id` PRIMARY KEY(`id`),
	CONSTRAINT `place_slug_uq` UNIQUE(`slug`),
	CONSTRAINT `place_source_uq` UNIQUE(`source_id`)
);
--> statement-breakpoint
CREATE TABLE `place_attribute` (
	`place_id` int NOT NULL,
	`attribute_id` varchar(48) NOT NULL,
	`value` tinyint NOT NULL,
	`confidence` tinyint NOT NULL DEFAULT 50,
	`source` enum('import','field_visit','owner','user','instagram','inferred') NOT NULL DEFAULT 'inferred',
	`verified_at` timestamp,
	CONSTRAINT `place_attribute_place_id_attribute_id_pk` PRIMARY KEY(`place_id`,`attribute_id`)
);
--> statement-breakpoint
CREATE TABLE `place_claim` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`user_id` char(36) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`note` varchar(500),
	`contact_phone` varchar(20),
	`reviewed_by_user_id` char(36),
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `place_claim_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `place_dish` (
	`place_id` int NOT NULL,
	`dish_id` int NOT NULL,
	`item_count` int NOT NULL DEFAULT 0,
	`min_price` int,
	`best_item_id` int,
	CONSTRAINT `place_dish_place_id_dish_id_pk` PRIMARY KEY(`place_id`,`dish_id`)
);
--> statement-breakpoint
CREATE TABLE `place_facet` (
	`place_id` int NOT NULL,
	`facet_id` varchar(48) NOT NULL,
	`item_count` int NOT NULL DEFAULT 0,
	`min_price` int,
	`median_price` int,
	`confidence` tinyint NOT NULL DEFAULT 80,
	CONSTRAINT `place_facet_place_id_facet_id_pk` PRIMARY KEY(`place_id`,`facet_id`)
);
--> statement-breakpoint
CREATE TABLE `place_hours` (
	`place_id` int NOT NULL,
	`dow` tinyint NOT NULL,
	`shift_index` tinyint NOT NULL DEFAULT 0,
	`opens_at` time,
	`closes_at` time,
	`crosses_midnight` boolean NOT NULL DEFAULT false,
	`closed` boolean NOT NULL DEFAULT false,
	CONSTRAINT `place_hours_place_id_dow_shift_index_pk` PRIMARY KEY(`place_id`,`dow`,`shift_index`)
);
--> statement-breakpoint
CREATE TABLE `place_hours_exception` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`date` date NOT NULL,
	`closed` boolean NOT NULL DEFAULT true,
	`opens_at` time,
	`closes_at` time,
	`reason` varchar(160),
	CONSTRAINT `place_hours_exception_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `place_phone` (
	`place_id` int NOT NULL,
	`phone` varchar(20) NOT NULL,
	`kind` enum('mobile','landline','reservation','other') NOT NULL DEFAULT 'other',
	`sort_order` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `place_phone_place_id_phone_pk` PRIMARY KEY(`place_id`,`phone`)
);
--> statement-breakpoint
CREATE TABLE `place_photo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`media_id` int NOT NULL,
	`alt` varchar(255) NOT NULL DEFAULT '',
	`sort_order` int NOT NULL DEFAULT 0,
	`source` enum('import','field_visit','owner','user','instagram','inferred') NOT NULL DEFAULT 'import',
	`uploaded_by_user_id` char(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `place_photo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `place_social` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`kind` enum('instagram','telegram','whatsapp','website','reservation','virtual_tour','survey','rubika','eitaa','bale','other') NOT NULL,
	`label` varchar(80),
	`url` varchar(500) NOT NULL,
	`handle` varchar(120),
	CONSTRAINT `place_social_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `place_submission` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` char(36),
	`name` varchar(200) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('pending','approved','rejected','duplicate') NOT NULL DEFAULT 'pending',
	`place_id` int,
	`reviewed_by_user_id` char(36),
	`reviewed_at` timestamp,
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `place_submission_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review` (
	`id` int AUTO_INCREMENT NOT NULL,
	`place_id` int NOT NULL,
	`user_id` char(36),
	`author_name` varchar(120) NOT NULL DEFAULT '',
	`stars` tinyint NOT NULL,
	`text` text,
	`rating_coffee` tinyint,
	`rating_food` tinyint,
	`rating_vibe` tinyint,
	`rating_service` tinyint,
	`rating_value` tinyint,
	`visit_date` date,
	`status` enum('pending','approved','rejected','spam') NOT NULL DEFAULT 'pending',
	`helpful_count` int NOT NULL DEFAULT 0,
	`moderated_by_user_id` char(36),
	`moderated_at` timestamp,
	`reject_reason` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_photo` (
	`review_id` int NOT NULL,
	`media_id` int NOT NULL,
	`sort_order` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `review_photo_review_id_media_id_pk` PRIMARY KEY(`review_id`,`media_id`)
);
--> statement-breakpoint
CREATE TABLE `review_reply` (
	`id` int AUTO_INCREMENT NOT NULL,
	`review_id` int NOT NULL,
	`user_id` char(36),
	`text` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_reply_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_vote` (
	`review_id` int NOT NULL,
	`user_id` char(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `review_vote_review_id_user_id_pk` PRIMARY KEY(`review_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `saved_place` (
	`user_id` char(36) NOT NULL,
	`place_id` int NOT NULL,
	`note` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_place_user_id_place_id_pk` PRIMARY KEY(`user_id`,`place_id`)
);
--> statement-breakpoint
CREATE TABLE `search_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`query` varchar(255) NOT NULL DEFAULT '',
	`facet_ids` varchar(500) NOT NULL DEFAULT '',
	`dish_id` int,
	`district_id` varchar(48),
	`sort` varchar(32),
	`price_max` int,
	`near_me` boolean NOT NULL DEFAULT false,
	`result_count` int NOT NULL,
	`clicked_place_id` int,
	`clicked_rank` int,
	`user_id` char(36),
	`session_id` char(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `search_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` varchar(64) NOT NULL,
	`value` json,
	`updated_by_user_id` char(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `setting_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_place_role` (
	`user_id` char(36) NOT NULL,
	`place_id` int NOT NULL,
	`role` enum('owner','manager','staff') NOT NULL DEFAULT 'owner',
	`status` enum('active','pending','revoked') NOT NULL DEFAULT 'active',
	`granted_by_user_id` char(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_place_role_user_id_place_id_pk` PRIMARY KEY(`user_id`,`place_id`)
);
--> statement-breakpoint
CREATE TABLE `user_preference` (
	`user_id` char(36) NOT NULL,
	`kind` enum('facet','dish','attribute','district') NOT NULL,
	`ref_id` varchar(64) NOT NULL,
	`weight` tinyint NOT NULL DEFAULT 1,
	`source` enum('quiz','behavior','explicit') NOT NULL DEFAULT 'quiz',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preference_user_id_kind_ref_id_pk` PRIMARY KEY(`user_id`,`kind`,`ref_id`)
);
--> statement-breakpoint
CREATE TABLE `user_taste_profile` (
	`user_id` char(36) NOT NULL,
	`budget_band` tinyint,
	`answers` json,
	`version` tinyint NOT NULL DEFAULT 1,
	`completed_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_taste_profile_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `app_user` ADD CONSTRAINT `app_user_avatar_media_id_media_id_fk` FOREIGN KEY (`avatar_media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_session` ADD CONSTRAINT `auth_session_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dish` ADD CONSTRAINT `dish_facet_id_facet_id_fk` FOREIGN KEY (`facet_id`) REFERENCES `facet`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dish_alias` ADD CONSTRAINT `dish_alias_dish_id_dish_id_fk` FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edit_suggestion` ADD CONSTRAINT `edit_suggestion_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `edit_suggestion` ADD CONSTRAINT `edit_suggestion_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_item` ADD CONSTRAINT `menu_item_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_item` ADD CONSTRAINT `menu_item_section_id_menu_section_id_fk` FOREIGN KEY (`section_id`) REFERENCES `menu_section`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_item` ADD CONSTRAINT `menu_item_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_item` ADD CONSTRAINT `menu_item_dish_id_dish_id_fk` FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_section` ADD CONSTRAINT `menu_section_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_section` ADD CONSTRAINT `menu_section_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `menu_section` ADD CONSTRAINT `menu_section_facet_id_facet_id_fk` FOREIGN KEY (`facet_id`) REFERENCES `facet`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place` ADD CONSTRAINT `place_district_id_district_id_fk` FOREIGN KEY (`district_id`) REFERENCES `district`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place` ADD CONSTRAINT `place_logo_media_id_media_id_fk` FOREIGN KEY (`logo_media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place` ADD CONSTRAINT `place_cover_media_id_media_id_fk` FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_attribute` ADD CONSTRAINT `place_attribute_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_attribute` ADD CONSTRAINT `place_attribute_attribute_id_attribute_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attribute`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_claim` ADD CONSTRAINT `place_claim_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_claim` ADD CONSTRAINT `place_claim_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_dish` ADD CONSTRAINT `place_dish_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_dish` ADD CONSTRAINT `place_dish_dish_id_dish_id_fk` FOREIGN KEY (`dish_id`) REFERENCES `dish`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_facet` ADD CONSTRAINT `place_facet_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_facet` ADD CONSTRAINT `place_facet_facet_id_facet_id_fk` FOREIGN KEY (`facet_id`) REFERENCES `facet`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_hours` ADD CONSTRAINT `place_hours_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_hours_exception` ADD CONSTRAINT `place_hours_exception_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_phone` ADD CONSTRAINT `place_phone_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_photo` ADD CONSTRAINT `place_photo_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_photo` ADD CONSTRAINT `place_photo_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_social` ADD CONSTRAINT `place_social_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_submission` ADD CONSTRAINT `place_submission_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `place_submission` ADD CONSTRAINT `place_submission_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review` ADD CONSTRAINT `review_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review` ADD CONSTRAINT `review_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_photo` ADD CONSTRAINT `review_photo_review_id_review_id_fk` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_photo` ADD CONSTRAINT `review_photo_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_reply` ADD CONSTRAINT `review_reply_review_id_review_id_fk` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_reply` ADD CONSTRAINT `review_reply_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_vote` ADD CONSTRAINT `review_vote_review_id_review_id_fk` FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_vote` ADD CONSTRAINT `review_vote_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_place` ADD CONSTRAINT `saved_place_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_place` ADD CONSTRAINT `saved_place_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_place_role` ADD CONSTRAINT `user_place_role_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_place_role` ADD CONSTRAINT `user_place_role_place_id_place_id_fk` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preference` ADD CONSTRAINT `user_preference_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_taste_profile` ADD CONSTRAINT `user_taste_profile_user_id_app_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `app_user_role_idx` ON `app_user` (`role`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `auth_session_user_idx` ON `auth_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `dish_facet_idx` ON `dish` (`facet_id`);--> statement-breakpoint
CREATE INDEX `dish_popular_idx` ON `dish` (`is_popular`);--> statement-breakpoint
CREATE INDEX `dish_alias_dish_idx` ON `dish_alias` (`dish_id`);--> statement-breakpoint
CREATE INDEX `edit_suggestion_status_idx` ON `edit_suggestion` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `facet_popular_idx` ON `facet` (`is_popular`);--> statement-breakpoint
CREATE INDEX `impersonation_admin_idx` ON `impersonation_log` (`admin_user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `media_status_idx` ON `media` (`status`);--> statement-breakpoint
CREATE INDEX `media_content_hash_idx` ON `media` (`content_hash`);--> statement-breakpoint
CREATE INDEX `menu_item_section_idx` ON `menu_item` (`section_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `menu_item_place_idx` ON `menu_item` (`place_id`);--> statement-breakpoint
CREATE INDEX `menu_item_dish_idx` ON `menu_item` (`dish_id`);--> statement-breakpoint
CREATE INDEX `menu_item_price_idx` ON `menu_item` (`price`);--> statement-breakpoint
CREATE INDEX `menu_section_place_idx` ON `menu_section` (`place_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `otp_phone_idx` ON `otp_code` (`phone`,`created_at`);--> statement-breakpoint
CREATE INDEX `page_view_created_idx` ON `page_view` (`created_at`);--> statement-breakpoint
CREATE INDEX `page_view_place_idx` ON `page_view` (`place_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `place_status_idx` ON `place` (`status`);--> statement-breakpoint
CREATE INDEX `place_district_idx` ON `place` (`district_id`);--> statement-breakpoint
CREATE INDEX `place_geo_idx` ON `place` (`geo_status`,`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `place_price_idx` ON `place` (`price_tier`);--> statement-breakpoint
CREATE INDEX `place_name_norm_idx` ON `place` (`name_normalized`);--> statement-breakpoint
CREATE INDEX `place_claim_status_idx` ON `place_claim` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `place_dish_dish_idx` ON `place_dish` (`dish_id`);--> statement-breakpoint
CREATE INDEX `place_facet_facet_idx` ON `place_facet` (`facet_id`);--> statement-breakpoint
CREATE INDEX `place_hours_exc_idx` ON `place_hours_exception` (`place_id`,`date`);--> statement-breakpoint
CREATE INDEX `place_photo_place_idx` ON `place_photo` (`place_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `place_social_place_idx` ON `place_social` (`place_id`);--> statement-breakpoint
CREATE INDEX `place_submission_status_idx` ON `place_submission` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_place_idx` ON `review` (`place_id`,`status`);--> statement-breakpoint
CREATE INDEX `review_user_idx` ON `review` (`user_id`);--> statement-breakpoint
CREATE INDEX `review_status_idx` ON `review` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_reply_review_idx` ON `review_reply` (`review_id`);--> statement-breakpoint
CREATE INDEX `saved_place_place_idx` ON `saved_place` (`place_id`);--> statement-breakpoint
CREATE INDEX `search_log_created_idx` ON `search_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `search_log_zero_idx` ON `search_log` (`result_count`);--> statement-breakpoint
CREATE INDEX `user_place_role_place_idx` ON `user_place_role` (`place_id`);