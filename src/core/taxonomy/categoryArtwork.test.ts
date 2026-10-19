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

test('verified empty source artwork falls back without overriding valid venue artwork', () => {
 const empty = '/media/section/ec/ec2236fe0e5dfa1d86b4e1d9b6392a34d85948e8'
 assert.equal(categoryArtwork('مخصوص سرآشپز', null, `${empty}.webp`), '/menu-categories/other.webp')
 assert.equal(categoryArtworkFull('مخصوص سرآشپز', null, `${empty}.full.webp`), '/menu-categories/other.webp')
 assert.equal(categoryArtwork('غذای اصلی', 'main_dish', `${empty}.webp`), '/menu-categories/v2/persian-food.webp')
 const valid = '/media/section/ba/ba26a5ea64206c11bb27cfd0ed13f10b57b5c005'
 assert.equal(categoryArtwork('غذاهای اصلی', 'main_dish', `${valid}.webp`), `${valid}.webp`)
 assert.equal(categoryArtworkFull('غذاهای اصلی', 'main_dish', `${valid}.full.webp`), `${valid}.full.webp`)
})
