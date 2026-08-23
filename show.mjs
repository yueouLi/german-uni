// 中文命令行数据浏览器
// 用法: node scripts/show.mjs [命令] [参数]
//
// 命令:
//   node scripts/show.mjs                       # 帮助
//   node scripts/show.mjs uni <关键词>          # 搜学校名
//   node scripts/show.mjs city <城市>           # 某城市的所有学校
//   node scripts/show.mjs typ <类型>            # TU / Universität / FH / Musik / Kunst / PH
//   node scripts/show.mjs top                   # 概览：类型分布、Top 城市
//   node scripts/show.mjs sql "<SQL 语句>"      # 自己写 SQL

import { openDb } from './_db.mjs';

const db = openDb();
const [cmd, ...args] = process.argv.slice(2);

// ------- 小工具：漂亮打印表格 -------
function printTable(rows, cols) {
    if (rows.length === 0) {
        console.log('  (没有结果)');
        return;
    }
    const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '?').length)));
    const header = cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
    console.log('  ' + header);
    console.log('  ' + widths.map((w) => '-'.repeat(w)).join('-+-'));
    for (const r of rows) {
        console.log('  ' + cols.map((c, i) => String(r[c] ?? '?').padEnd(widths[i])).join(' | '));
    }
    console.log(`  (${rows.length} 条)`);
}

function hilfe() {
    console.log(`
用法:
  node scripts/show.mjs uni <关键词>      搜学校名（模糊匹配）
      例: node scripts/show.mjs uni Heidelberg
  node scripts/show.mjs city <城市>       某城市的学校
      例: node scripts/show.mjs city München
  node scripts/show.mjs typ <类型>        按类型: TU / Universität / FH / Kunst / Musik / PH
      例: node scripts/show.mjs typ TU
  node scripts/show.mjs top               总览（类型分布 + Top 城市）
  node scripts/show.mjs sql "SELECT ..."  自己写 SQL

数据库位置:
  data/dt-uni.db
`);
}

if (!cmd) {
    hilfe();
    db.close();
    process.exit(0);
}

if (cmd === 'uni') {
    const q = args.join(' ');
    if (!q) { console.log('请给出关键词，例: node scripts/show.mjs uni TUM'); process.exit(1); }
    console.log(`\n=== 搜索: "${q}" ===`);
    const rows = db
        .prepare(
            `SELECT name_de AS 名称, stadt AS 城市, typ AS 类型, latitude AS 纬度, longitude AS 经度
             FROM hochschule
             WHERE name_de LIKE ? OR name_en LIKE ? OR name_kurz LIKE ?
             ORDER BY name_de
             LIMIT 30`
        )
        .all('%' + q + '%', '%' + q + '%', '%' + q + '%');
    printTable(rows, ['名称', '城市', '类型', '纬度', '经度']);
}

else if (cmd === 'city') {
    const q = args.join(' ');
    if (!q) { console.log('请给出城市名'); process.exit(1); }
    console.log(`\n=== ${q} 的学校 ===`);
    const rows = db
        .prepare(
            `SELECT name_de AS 名称, typ AS 类型, gruendungsjahr AS 建校年, studenten_anzahl AS 学生数
             FROM hochschule
             WHERE stadt = ?
             ORDER BY typ, name_de`
        )
        .all(q);
    printTable(rows, ['名称', '类型', '建校年', '学生数']);
}

else if (cmd === 'typ') {
    const q = args[0];
    if (!q) { console.log('请给出类型: TU / Universität / FH / Kunst / Musik / PH / Sonstige'); process.exit(1); }
    console.log(`\n=== 类型 = ${q} ===`);
    const rows = db
        .prepare(
            `SELECT name_de AS 名称, stadt AS 城市, gruendungsjahr AS 建校年, studenten_anzahl AS 学生数
             FROM hochschule
             WHERE typ = ?
             ORDER BY studenten_anzahl DESC NULLS LAST, name_de
             LIMIT 100`
        )
        .all(q);
    printTable(rows, ['名称', '城市', '建校年', '学生数']);
}

else if (cmd === 'top') {
    console.log('\n=== 类型分布 ===');
    const byTyp = db.prepare('SELECT typ AS 类型, COUNT(*) AS 数量 FROM hochschule GROUP BY typ ORDER BY 数量 DESC').all();
    printTable(byTyp, ['类型', '数量']);

    console.log('\n=== Top 20 城市 ===');
    const byCity = db
        .prepare(`SELECT stadt AS 城市, COUNT(*) AS 数量 FROM hochschule WHERE stadt IS NOT NULL GROUP BY stadt ORDER BY 数量 DESC LIMIT 20`)
        .all();
    printTable(byCity, ['城市', '数量']);

    console.log('\n=== 学生数最多的 15 所 ===');
    const bySize = db
        .prepare(`SELECT name_de AS 名称, stadt AS 城市, typ AS 类型, studenten_anzahl AS 学生数
                  FROM hochschule WHERE studenten_anzahl IS NOT NULL
                  ORDER BY studenten_anzahl DESC LIMIT 15`)
        .all();
    printTable(bySize, ['名称', '城市', '类型', '学生数']);
}

else if (cmd === 'sql') {
    const q = args.join(' ');
    try {
        const stmt = db.prepare(q);
        const rows = stmt.all();
        if (rows.length === 0) console.log('(无结果)');
        else printTable(rows, Object.keys(rows[0]));
    } catch (e) {
        console.error('SQL 错误:', e.message);
    }
}

else {
    console.log(`未知命令: ${cmd}`);
    hilfe();
}

db.close();
