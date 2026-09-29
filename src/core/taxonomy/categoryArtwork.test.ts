import test from 'node:test'
import assert from 'node:assert/strict'
import {categoryArtwork, categoryArtworkFull} from './categoryArtwork'
test('category illustrations follow semantic food groups with safe fallback',()=>{
 assert.equal(categoryArtwork('قهوه گرم'),'/menu-categories/v2/coffee.webp')
 assert.equal(categoryArtwork('پاستا / Pasta'),'/menu-categories/v2/pasta.webp')
 assert.equal(categoryArtwork('صبحانه'),'/menu-categories/v2/breakfast.webp')
 assert.equal(categoryArtwork('افزودنی‌ها'),'/menu-categories/v2/extras.webp')
 assert.equal(categoryArtwork('سرد نوش‌ها'),'/menu-categories/v2/mocktail.webp')
 assert.equal(categoryArtwork('نام بسیار طولانی و ناشناخته'),'/menu-categories/other.webp')
 assert.equal(categoryArtwork('هر نامی', 'matcha'), '/menu-categories/v2/matcha.webp')
 assert.equal(categoryArtwork('قهوه', 'coffee', '/media/section/custom.webp'), '/media/section/custom.webp')
})

test('large category artwork uses the high resolution library asset and preserves custom media',()=>{
 assert.equal(categoryArtworkFull('قهوه گرم'),'/menu-categories/v2/coffee.full.webp')
 assert.equal(categoryArtworkFull('نام ناشناخته'),'/menu-categories/other.webp')
 assert.equal(categoryArtworkFull('قهوه', 'coffee', '/media/section/custom-full.webp'), '/media/section/custom-full.webp')
 assert.equal(categoryArtworkFull('قهوه', 'coffee', '/menu-categories/v2/coffee.full.webp'), '/menu-categories/v2/coffee.full.webp')
})
