import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMenuCsv, selectMenuRows, MENU_CSV_TEMPLATE } from './menuCsv'
const input = (value: string) => `name,price,description\n${value}`
test('template, BOM and Persian/Arabic digits retain explicit toman and null', () => {
  assert.equal(parseMenuCsv(MENU_CSV_TEMPLATE, ',').length, 2)
  const rows = parseMenuCsv('\uFEFF' + input('لاته,۱۲۳۰۰۰,توضیح\r\nچای,١٢٠٠٠,\r\nآب,0,\r\nدمنوش,,'), ',')
  assert.deepEqual(rows.map(row => row.price), [123000,12000,0,null])
  assert.ok(rows.every(row => !row.error))
})
test('quoted comma price, escaped quotes and multiline description', () => {
  const rows = parseMenuCsv(input('لاته,"120,000","سطر اول\nسطر ""دوم"""'), ',')
  assert.equal(rows[0]!.price, 120000); assert.equal(rows[0]!.description, 'سطر اول\nسطر "دوم"')
})
test('TSV and semicolon are explicit; header/order cannot be guessed', () => {
  assert.equal(parseMenuCsv('name\tprice\tdescription\nقهوه\t120000\tتست', '\t')[0]!.price,120000)
  assert.equal(parseMenuCsv('name;price;description\nقهوه;120000;تست', ';')[0]!.price,120000)
  assert.throws(()=>parseMenuCsv(MENU_CSV_TEMPLATE,';'))
  assert.throws(()=>parseMenuCsv('price,name,description\n1,لاته,',','))
  assert.throws(()=>parseMenuCsv(MENU_CSV_TEMPLATE,'|'))
})
test('invalid row is visible, not silently coerced/truncated', () => {
  for (const value of ['-1','1.5','1e5','1,2','Infinity','۲۱۴۷۴۸۳۶۴۸','120 تومان','1 000']) {
    assert.ok(parseMenuCsv(input(`لاته,"${value}",`),',')[0]!.error, value)
  }
  assert.ok(parseMenuCsv(input('لاته,1,توضیح,اضافی'),',')[0]!.error)
  assert.ok(parseMenuCsv(input(`${'ن'.repeat(251)},1,`),',')[0]!.error)
  assert.ok(parseMenuCsv(input(`لاته,1,${'ن'.repeat(4001)}`),',')[0]!.error)
})
test('malformed quotes, byte/row limits and empty files fail before writes', () => {
  for(const raw of ['"لاته,1,','لات"ه,1,','"لاته"x,1,']) assert.throws(()=>parseMenuCsv(input(raw),','))
  assert.throws(()=>parseMenuCsv('name,price,description\n',','))
  assert.throws(()=>parseMenuCsv(input('ن'.repeat(40000)),','))
  assert.throws(()=>parseMenuCsv(input(Array.from({length:101},(_,i)=>`لاته ${i},1,`).join('\n')),','))
})
test('normalized duplicate rows cannot both be applied', () => {
  const rows = parseMenuCsv(input('كافه,1,\nکافه,2,'),',')
  assert.ok(rows[1]!.error)
})
test('select only known eligible rows, at most 20 and without duplicate ids', () => {
  const rows = parseMenuCsv(MENU_CSV_TEMPLATE,',').map(row=>({...row,duplicate:false}))
  assert.equal(selectMenuRows('[1]',rows)[0]!.price,null)
  for(const value of ['null','[]','[0,0]','[-1]','[0.1]','[99]','{}','oops']) assert.throws(()=>selectMenuRows(value,rows))
  rows[0]!.duplicate=true; assert.throws(()=>selectMenuRows('[0]',rows))
  rows[1]!.error='خطا'; assert.throws(()=>selectMenuRows('[1]',rows))
})
