/** A self-contained print identity, shared by the iframe and canvas exporter. */
export const clientReportStyles = `
@font-face{font-family:ReportSans;src:url('/fonts/Geist-latin-ext.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap;unicode-range:U+0020,U+0041,U+00A0,U+00C1,U+0100-0113,U+0116-012B,U+012E-0130,U+0132-0137,U+0139-013E,U+0141-0148,U+014A-014D,U+0150-0151,U+0154-017E,U+018F,U+0192,U+01CD-01CE,U+01E4-01E9,U+0218-021B,U+0237,U+0259,U+02B9,U+02BC,U+02C7-02C8,U+02DD,U+0300-0301,U+0303-0304,U+0308,U+1E20-1E21,U+1E80-1E85,U+1E9E,U+1EF2-1EF3,U+1EF8-1EF9,U+2020,U+20AA,U+20B4,U+20B9,U+20BD,U+A78B-A78C}
@font-face{font-family:ReportSans;src:url('/fonts/Geist-latin.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap;unicode-range:U+0020-007E,U+00A0-00AC,U+00AE-00FF,U+0102,U+0131,U+0152-0153,U+02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+2044,U+20AC,U+2122,U+2191,U+2193,U+2212}
.pdf-root{width:794px;background:#ffffff;color:#171b2b;font:12px/1.5 'ReportSans',Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pdf-root *{box-sizing:border-box}
.pdf-root h1,.pdf-root h2,.pdf-root h3,.pdf-root p,.pdf-root figure,.pdf-root dl,.pdf-root dd{margin:0}
.pdf-root strong{font-weight:700}
.pdf-root img{display:block}
.pdf-root table{width:100%;border-collapse:collapse;table-layout:fixed}
.pdf-root svg{display:block;flex-shrink:0}
.pdf-page{position:relative;width:794px;height:1123px;padding:36px 46px 110px;background:#ffffff;overflow:hidden;break-after:page;page-break-after:always}
.pdf-content{width:100%}
.pdf-kicker{font:600 9px/1.45 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:1.35px;color:#6438e6;text-transform:uppercase}

/* Compact brand header. */
.pdf-brand{display:flex;justify-content:space-between;align-items:center;gap:25px;padding-bottom:15px;margin-bottom:22px;border-bottom:1px solid #e3e7ef}
.pdf-brand-identity{display:flex;align-items:center;gap:10px}
.pdf-brand-identity img{width:24px;height:34px;object-fit:contain}
.pdf-brand-identity strong{display:block;color:#171b2b;font-size:25px;line-height:1.1;font-weight:600;letter-spacing:-1.25px}
.pdf-brand-identity span{display:block;font-size:7px;letter-spacing:1.7px;color:#657085;margin-top:5px}
.pdf-document{text-align:right;max-width:260px}
.pdf-document strong{display:block;font-size:9px;line-height:1.5;font-weight:500;letter-spacing:.4px;text-transform:uppercase;color:#526077}
.pdf-document small{display:block;font-size:10px;color:#657085;margin-top:4px}

/* Bold sans-serif title and an open column for the highlighted assessment. */
.pdf-hero{display:flex;justify-content:space-between;gap:22px;margin:0 0 18px;min-height:200px}
.pdf-hero-copy{flex:1;min-width:0;padding-top:9px}
.pdf-hero h1{font-family:'ReportSans',Arial,Helvetica,sans-serif;font-size:46px;font-weight:750;line-height:1.06;letter-spacing:-1.9px;color:#171b2b;margin:17px 0 16px}
.pdf-hero h1 em{font-style:normal;font-weight:750;color:#6438e6}
.pdf-hero-copy>.pdf-kicker::before{content:"";display:inline-block;width:6px;height:6px;margin-right:8px;background:#6438e6;vertical-align:1px}.pdf-hero-copy>p{font-size:11px;line-height:1.7;color:#526077;max-width:370px}
.pdf-focus{position:relative;width:190px;min-height:190px;background:#ffffff;color:#171b2b;padding:20px 0 16px 27px;flex-shrink:0;border-left:1px solid #e3e7ef;overflow:hidden}
.pdf-focus::before{content:"";position:absolute;top:20px;right:2px;width:7px;height:7px;background:#00b5cd}
.pdf-focus .pdf-kicker{color:#6438e6;font-size:8px;letter-spacing:1.5px}
.pdf-focus-value{font:700 77px/1 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-3.5px;margin:12px 0 4px;white-space:nowrap;color:#171b2b}
.pdf-focus-value>span{font-size:.42em;letter-spacing:-1px;margin-left:3px;color:#6438e6}
.pdf-focus>p{font-size:11px;letter-spacing:.2px;color:#526077}
.pdf-focus-note{position:relative;font-size:9px;line-height:1.65;color:#6438e6;margin-top:12px;z-index:1}
.pdf-people{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:0 0 19px!important;padding:0 0 17px;border-bottom:1px solid #e3e7ef}
.pdf-people>div{min-width:0}
.pdf-people dt{font-size:8px;text-transform:uppercase;letter-spacing:1.15px;color:#657085}
.pdf-people dd{margin-top:5px;font-size:13px;font-weight:600;line-height:1.4;color:#171b2b;overflow-wrap:anywhere}
.pdf-parameters{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:0 0 18px;border-bottom:1px solid #e3e7ef;margin-bottom:20px}
.pdf-parameters>div{flex-shrink:0}
.pdf-parameters small{display:block;font-size:8px;letter-spacing:1px;color:#657085;margin-bottom:6px}
.pdf-parameters strong{display:block;font-size:25px;font-weight:500;line-height:1.25;white-space:nowrap;color:#171b2b}
.pdf-parameters>p{max-width:330px;font-size:11px;line-height:1.6;color:#526077}
.pdf-parameters>p>span{display:block;font-size:9px;margin-top:5px;color:#657085}
.pdf-section-heading{display:flex;justify-content:space-between;align-items:baseline;gap:25px;margin:22px 0 14px}
.pdf-section-heading h2{font:650 21px/1.25 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.5px;color:#171b2b}
.pdf-section-heading>span{text-align:right;font-size:9px;line-height:1.6;color:#657085}

/* Large, aligned results with a restrained violet highlight. */
.pdf-summary{border-bottom:1px solid #e3e7ef}
.pdf-summary th{padding:13px 10px 12px;text-align:right;border-top:2px solid #6438e6;border-bottom:1px solid #e3e7ef;color:#657085;font-size:8px;letter-spacing:.6px;font-weight:400}
.pdf-summary th:first-child{text-align:left;width:48%;vertical-align:bottom;padding-left:0;padding-bottom:16px}
.pdf-summary.pdf-multi th:first-child{width:37%}
.pdf-summary th>span{display:block;font-size:8px;letter-spacing:1.2px;text-transform:uppercase}
.pdf-summary th strong{display:block;font:700 28px/1.2 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.6px;color:#6438e6;margin:4px 0}
.pdf-summary th small{font-size:8px;letter-spacing:0;font-weight:400;color:#657085}
.pdf-summary td{padding:17px 10px;border-bottom:1px solid #e3e7ef;vertical-align:middle;text-align:right}
.pdf-summary td:first-child{padding-left:0;text-align:left}
.pdf-summary td:last-child,.pdf-summary th:last-child{padding-right:0}
.pdf-row-name{display:flex;align-items:center;gap:12px}
.pdf-row-logo{display:flex;align-items:center;justify-content:center;width:46px;height:36px;flex-shrink:0}
.pdf-row-logo img{max-width:100%;max-height:33px;object-fit:contain}
.pdf-row-name>div:last-child{min-width:0}
.pdf-row-name strong{display:block;font-size:12px;font-weight:600;line-height:1.3;color:#171b2b}
.pdf-product-number{font-size:8px;letter-spacing:.5px;color:#6438e6;font-weight:400;margin-right:6px}.pdf-row-name span{display:block;font-size:10px;line-height:1.4;margin-top:4px;color:#526077}
.pdf-row-name small{display:block;font-size:9px;line-height:1.4;margin-top:5px;color:#657085}
.pdf-payout{display:inline-block;font-size:23px;line-height:1.3;font-weight:650;white-space:nowrap;color:#171b2b;padding-bottom:3px}
.pdf-multi .pdf-payout{font-size:16px;}
.pdf-best{background:#f6f3ff}.pdf-best .pdf-payout{font-weight:700;color:#6438e6}.pdf-summary-key i{background:#6438e6}
.pdf-summary tfoot td{padding:12px 10px;border-top:1px solid #e3e7ef;background:#f5f7fb;font-size:11px;white-space:nowrap;color:#414b61;font-weight:600}
.pdf-summary tfoot td:first-child{padding-left:12px;font-size:9px;white-space:normal;line-height:1.5;color:#526077;font-weight:500}
.pdf-summary tfoot small{font-size:8px;color:#657085}
.pdf-summary tfoot td:last-child{padding-right:10px}
.pdf-summary-key{display:flex;gap:7px;align-items:center;margin-top:10px;color:#657085;font-size:8px;line-height:1.5}
.pdf-summary-key i{width:12px;height:2px;background:#6438e6;display:block;flex-shrink:0}
.pdf-empty{padding:35px 20px;border-top:1px solid #e3e7ef;border-bottom:1px solid #e3e7ef;text-align:center;color:#657085}
.pdf-insight{display:flex;justify-content:space-between;gap:34px;border-top:1px solid #e3e7ef;margin-top:17px;padding-top:16px}
.pdf-insight-copy{flex:1;min-width:0}
.pdf-insight-copy .pdf-kicker{font-size:8px;letter-spacing:.9px}
.pdf-insight-copy>strong{display:block;font:700 34px/1.25 'ReportSans',Arial,Helvetica,sans-serif;color:#6438e6;margin:5px 0}
.pdf-insight-copy>p{font-size:9px;line-height:1.6;color:#657085}
.pdf-comparison-figure{width:300px;flex-shrink:0}
.pdf-comparison-figure svg{width:100%;height:auto}
.pdf-insight-range{align-self:center;min-width:0}
.pdf-insight-range>span{display:block;font-size:9px;color:#657085;margin-bottom:8px}
.pdf-insight-range>strong{display:block;font-size:16px;font-weight:500;white-space:nowrap;color:#6438e6}
.pdf-insight-range i{font-style:normal;color:#007f98;margin:0 12px}

/* Compact cover variant, without shrinking product or payout text. */
.pdf-cover-dense .pdf-hero{min-height:164px;margin-bottom:18px}
.pdf-cover-dense .pdf-hero-copy{padding-top:3px}
.pdf-cover-dense .pdf-hero h1{font-size:39px;margin:12px 0}
.pdf-cover-dense .pdf-hero-copy>p{font-size:10px;line-height:1.6}
.pdf-cover-dense .pdf-focus{min-height:164px;padding:17px 0 14px 26px}
.pdf-cover-dense .pdf-focus-value{font-size:62px;margin-top:10px}
.pdf-focus-value.pdf-focus-value-three{font-size:64px}.pdf-focus-value.pdf-focus-value-wide{font-size:48px;letter-spacing:-1.6px}.pdf-cover-dense .pdf-focus-value.pdf-focus-value-wide{font-size:44px}.pdf-cover-dense .pdf-focus-note{margin-top:10px;font-size:8px}
.pdf-cover-dense .pdf-people{margin-bottom:15px!important;padding-bottom:13px}
.pdf-cover-dense .pdf-parameters{padding-bottom:14px;margin-bottom:16px}
.pdf-cover-dense .pdf-summary td{padding-top:12px;padding-bottom:12px}
.pdf-cover-dense .pdf-summary tfoot td{padding-top:10px;padding-bottom:10px}
.pdf-continuation{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin:3px 0 24px}
.pdf-continuation h1{font:700 29px/1.2 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.8px}
.pdf-continuation>span{font-size:9px;color:#657085}
.pdf-continued .pdf-parameters strong{font-size:23px}
.pdf-continued .pdf-summary td{padding-top:12px;padding-bottom:12px}

/* Explanations use a product margin and a consistent reading column. */
.pdf-explanation-title{font:700 33px/1.15 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-1.2px;color:#171b2b;margin:12px 0 18px!important}
.pdf-explanation-title em{font-style:normal;font-weight:700;color:#6438e6}
.pdf-explanation-claim{font-size:12px;line-height:1.55;font-weight:600;color:#171b2b;margin-bottom:8px!important}
.pdf-explanation-lead{font-size:12px;line-height:1.7;color:#526077;max-width:650px;margin-bottom:20px!important}
.pdf-process{display:flex;gap:22px;padding:17px 0 18px;border-top:1px solid #e3e7ef;border-bottom:1px solid #e3e7ef;margin:20px 0 10px}
.pdf-process>div{display:flex;gap:12px;align-items:center;flex:1;min-width:0}
.pdf-process>div>span{font:650 23px/1 'ReportSans',Arial,Helvetica,sans-serif;color:#007f98}
.pdf-process strong{display:block;font-size:10px;font-weight:600;color:#171b2b}
.pdf-process small{display:block;font-size:8px;margin-top:3px;color:#657085;line-height:1.5}
.pdf-explanation-card{display:grid;grid-template-columns:145px minmax(0,1fr);gap:27px;padding:24px 0 25px;border-bottom:1px solid #e3e7ef;break-inside:avoid}
.pdf-explanation-product{padding-top:2px;min-width:0}
.pdf-explanation-product .pdf-kicker{font-size:8px;letter-spacing:1px}
.pdf-explanation-product>img{width:60px;height:41px;object-fit:contain;object-position:left center;margin:15px 0 12px}
.pdf-explanation-product h2{font:650 18px/1.2 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.4px;color:#171b2b;overflow-wrap:anywhere;margin-top:10px}
.pdf-product-version{margin-top:11px}
.pdf-product-version>span{display:block;font-size:9px;line-height:1.6;color:#657085}
.pdf-explanation-copy{min-width:0}
.pdf-explanation-copy>h3{font-size:15px;line-height:1.4;font-weight:600;letter-spacing:-.2px;color:#171b2b;margin-bottom:15px}
.pdf-explanation-copy>p{font-size:13px;line-height:1.65;color:#414b61}
.pdf-explanation-copy .pdf-explanation-rule-label{font-size:8px;font-weight:600;line-height:1.5;letter-spacing:.9px;color:#6438e6;margin-bottom:7px!important}
.pdf-explanation-copy .pdf-explanation-secondary{font-size:11px;line-height:1.6;color:#657085;margin-top:10px}
.pdf-example{display:flex;justify-content:space-between;gap:18px;margin-top:18px;padding-top:14px;border-top:1px solid #e3e7ef}
.pdf-example-calculation{flex:1;min-width:0}
.pdf-example-calculation>span{display:block;font-size:8px;letter-spacing:.5px;line-height:1.5;color:#6438e6}
.pdf-example .pdf-equation{font-size:12px;line-height:1.6;color:#414b61;margin-top:7px}
.pdf-example small{display:block;font-size:9px;line-height:1.6;color:#657085;margin-top:5px}
.pdf-example>strong{font:700 25px/1.15 'ReportSans',Arial,Helvetica,sans-serif;white-space:nowrap;color:#6438e6;align-self:center}
.pdf-explanations-dense .pdf-explanation-card{padding:19px 0 20px;grid-template-columns:135px minmax(0,1fr);gap:25px}
.pdf-explanations-dense .pdf-explanation-copy>h3{font-size:14px;margin-bottom:11px}
.pdf-explanations-dense .pdf-explanation-copy>p{font-size:11px;line-height:1.6}
.pdf-explanations-dense .pdf-explanation-copy .pdf-explanation-secondary{font-size:10px}
.pdf-explanations-dense .pdf-example{margin-top:13px;padding-top:10px}
.pdf-explanations-dense .pdf-example>strong{font-size:24px}
.pdf-explanations-dense .pdf-example .pdf-equation{font-size:11px}

/* Supporting graphs and source tables share the same print identity. */
.pdf-product-heading{display:flex;gap:20px;align-items:center;margin:27px 0}
.pdf-product-logo{display:flex;align-items:center;justify-content:center;width:65px;height:52px;flex-shrink:0}
.pdf-product-logo img{max-width:100%;max-height:46px;object-fit:contain}
.pdf-product-heading>div:last-child{min-width:0}
.pdf-product-heading h1{font:700 28px/1.2 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.75px;color:#171b2b;margin:8px 0 9px}
.pdf-badges{display:flex;gap:12px;flex-wrap:wrap}
.pdf-badges>span{font-size:9px;line-height:1.5;color:#657085}
.pdf-detail-metrics{display:flex;gap:30px;padding:16px 0;border-top:1px solid #e3e7ef;border-bottom:1px solid #e3e7ef;margin-bottom:25px}
.pdf-detail-metrics>div{flex:1}
.pdf-detail-metrics small{display:block;font-size:8px;letter-spacing:1px;line-height:1.5;color:#657085;margin-bottom:6px}
.pdf-detail-metrics strong{font-size:21px;font-weight:400;color:#6438e6}
.pdf-section-title{font:650 23px/1.3 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.4px;color:#171b2b;margin:22px 0 9px!important}
.pdf-intro{font-size:11px;line-height:1.7;color:#657085;margin-bottom:12px!important}
.pdf-chart{padding:9px 0;border-top:1px solid #e3e7ef;border-bottom:1px solid #e3e7ef;margin:20px 0 23px}
.pdf-chart svg{width:100%;height:auto}
.pdf-scenario-cards{display:flex;gap:25px;margin-top:18px}
.pdf-scenario-card{flex:1;min-width:0;border-top:2px solid #6438e6;padding-top:13px}
.pdf-scenario-card small{display:block;font-size:8px;letter-spacing:1px;line-height:1.5}
.pdf-scenario-card h3{font:650 21px/1.3 'ReportSans',Arial,Helvetica,sans-serif;letter-spacing:-.3px;color:#6438e6;margin:8px 0 9px}
.pdf-scenario-card strong{display:block;font-size:20px;font-weight:500;color:#6438e6;white-space:nowrap}
.pdf-scenario-card p{font-size:10px;line-height:1.6;color:#657085;margin-top:6px}
.pdf-formula{display:flex;align-items:baseline;gap:25px;border-top:1px solid #e3e7ef;margin-top:28px;padding-top:16px}
.pdf-formula strong{font-size:10px;font-weight:600;color:#6438e6;flex-shrink:0}
.pdf-formula p{font-size:11px;line-height:1.7;color:#657085}
.pdf-progression-grid{display:flex;align-items:flex-start;gap:24px;margin-top:20px}
.pdf-progression-grid>table{flex:1;width:0}
.pdf-progression th{padding:10px 9px;border-top:2px solid #6438e6;border-bottom:1px solid #e3e7ef;text-align:right;font-size:10px;font-weight:500;line-height:1.45;color:#6438e6}
.pdf-progression td{padding:7px 9px;border-bottom:1px solid #e3e7ef;text-align:right;font-size:11px;line-height:1.5;color:#66505b}
.pdf-progression td:first-child,.pdf-progression th:first-child{text-align:left}
.pdf-progression tr:nth-child(even) td{background:#f5f7fb}

/* Native numeric shaping and custom tracking diverge in canvas export. */
.pdf-payout,.pdf-summary tfoot td:not(:first-child),.pdf-equation,.pdf-example>strong,.pdf-parameters strong,.pdf-insight-copy>strong,.pdf-detail-metrics strong,.pdf-scenario-card strong,.pdf-insight-range>strong{font-variant-numeric:normal;font-feature-settings:normal;letter-spacing:normal;word-spacing:normal}

.pdf-footer{position:absolute;left:46px;right:46px;bottom:27px;border-top:1px solid #e3e7ef;padding-top:12px}
.pdf-footer>p{font-size:9px;line-height:1.6;color:#657085;margin-bottom:10px;max-width:690px}
.pdf-footer>div{display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:9px;color:#657085}
.pdf-footer strong{color:#414b61;font-weight:600}
.pdf-footer>div>span:last-child{font-size:10px;letter-spacing:1px;color:#6438e6}
.pdf-page:last-child{break-after:auto;page-break-after:auto}
@media print{.pdf-root{width:210mm}.pdf-page{width:210mm;height:297mm;break-inside:avoid;page-break-inside:avoid}@page{size:A4;margin:0}}
`;
