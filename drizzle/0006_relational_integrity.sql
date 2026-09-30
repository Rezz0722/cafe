-- Restore the relational constraints declared in schema.ts. The imported
-- production dump lacked them, so deleting a place/user left orphan rows.

-- Only impossible references are removed. A backup is required before Phase 1.
DELETE mi FROM menu_item mi LEFT JOIN place p ON p.id = mi.place_id WHERE p.id IS NULL;
DELETE ms FROM menu_section ms LEFT JOIN place p ON p.id = ms.place_id WHERE p.id IS NULL;
DELETE s FROM auth_session s LEFT JOIN app_user u ON u.id = s.user_id WHERE u.id IS NULL;
DELETE upr FROM user_place_role upr LEFT JOIN app_user u ON u.id = upr.user_id WHERE u.id IS NULL;

-- MariaDB needs checks disabled to add FKs INPLACE to tables with FULLTEXT.
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE app_user ADD CONSTRAINT app_user_avatar_media_id_media_id_fk FOREIGN KEY (avatar_media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE auth_session ADD CONSTRAINT auth_session_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE dish ADD CONSTRAINT dish_facet_id_facet_id_fk FOREIGN KEY (facet_id) REFERENCES facet(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE dish_alias ADD CONSTRAINT dish_alias_dish_id_dish_id_fk FOREIGN KEY (dish_id) REFERENCES dish(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE edit_suggestion ADD CONSTRAINT edit_suggestion_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE edit_suggestion ADD CONSTRAINT edit_suggestion_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_item ADD CONSTRAINT menu_item_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_item ADD CONSTRAINT menu_item_section_id_menu_section_id_fk FOREIGN KEY (section_id) REFERENCES menu_section(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_item ADD CONSTRAINT menu_item_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_item ADD CONSTRAINT menu_item_dish_id_dish_id_fk FOREIGN KEY (dish_id) REFERENCES dish(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_section ADD CONSTRAINT menu_section_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_section ADD CONSTRAINT menu_section_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE menu_section ADD CONSTRAINT menu_section_facet_id_facet_id_fk FOREIGN KEY (facet_id) REFERENCES facet(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place ADD CONSTRAINT place_district_id_district_id_fk FOREIGN KEY (district_id) REFERENCES district(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place ADD CONSTRAINT place_logo_media_id_media_id_fk FOREIGN KEY (logo_media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place ADD CONSTRAINT place_cover_media_id_media_id_fk FOREIGN KEY (cover_media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_attribute ADD CONSTRAINT place_attribute_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_attribute ADD CONSTRAINT place_attribute_attribute_id_attribute_id_fk FOREIGN KEY (attribute_id) REFERENCES attribute(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_claim ADD CONSTRAINT place_claim_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_claim ADD CONSTRAINT place_claim_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_dish ADD CONSTRAINT place_dish_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_dish ADD CONSTRAINT place_dish_dish_id_dish_id_fk FOREIGN KEY (dish_id) REFERENCES dish(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_facet ADD CONSTRAINT place_facet_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_facet ADD CONSTRAINT place_facet_facet_id_facet_id_fk FOREIGN KEY (facet_id) REFERENCES facet(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_hours ADD CONSTRAINT place_hours_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_hours_exception ADD CONSTRAINT place_hours_exception_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_phone ADD CONSTRAINT place_phone_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_photo ADD CONSTRAINT place_photo_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_photo ADD CONSTRAINT place_photo_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_social ADD CONSTRAINT place_social_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_submission ADD CONSTRAINT place_submission_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE place_submission ADD CONSTRAINT place_submission_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE SET NULL, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review ADD CONSTRAINT review_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review ADD CONSTRAINT review_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review_photo ADD CONSTRAINT review_photo_review_id_review_id_fk FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review_photo ADD CONSTRAINT review_photo_media_id_media_id_fk FOREIGN KEY (media_id) REFERENCES media(id), ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review_reply ADD CONSTRAINT review_reply_review_id_review_id_fk FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review_reply ADD CONSTRAINT review_reply_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE SET NULL, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review_vote ADD CONSTRAINT review_vote_review_id_review_id_fk FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE review_vote ADD CONSTRAINT review_vote_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE saved_place ADD CONSTRAINT saved_place_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE saved_place ADD CONSTRAINT saved_place_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE user_place_role ADD CONSTRAINT user_place_role_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE user_place_role ADD CONSTRAINT user_place_role_place_id_place_id_fk FOREIGN KEY (place_id) REFERENCES place(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE user_preference ADD CONSTRAINT user_preference_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;
ALTER TABLE user_taste_profile ADD CONSTRAINT user_taste_profile_user_id_app_user_id_fk FOREIGN KEY (user_id) REFERENCES app_user(id) ON DELETE CASCADE, ALGORITHM=INPLACE, LOCK=SHARED;

SET FOREIGN_KEY_CHECKS = 1;
