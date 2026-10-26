/** A self-contained print identity, shared by the iframe and canvas exporter. */
export const clientReportStyles = `
.pdf-root{width:794px;background:#f7f3ed;color:#342332;font:12px/1.5 Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pdf-root *{box-sizing:border-box}
.pdf-root h1,.pdf-root h2,.pdf-root h3,.pdf-root p,.pdf-root figure,.pdf-root dl,.pdf-root dd{margin:0}
.pdf-root h1,.pdf-root h2,.pdf-root h3{font-weight:400}
.pdf-root strong{font-weight:700}
.pdf-root img{display:block}
.pdf-root table{width:100%;border-collapse:collapse;table-layout:fixed}
.pdf-root svg{display:block;flex-shrink:0}
.pdf-page{position:relative;width:794px;height:1123px;padding:36px 46px 110px;background:#f7f3ed;overflow:hidden;break-after:page;page-break-after:always}
.pdf-content{width:100%}
.pdf-kicker{font:600 9px/1.45 Arial,Helvetica,sans-serif;letter-spacing:1.35px;color:#80553e;text-transform:uppercase}

/* Masthead, aligned to a fixed baseline. */
.pdf-brand{display:flex;justify-content:space-between;align-items:center;gap:25px;padding-bottom:15px;margin-bottom:22px;border-bottom:1px solid #c9b7a7}
.pdf-brand-identity{display:flex;align-items:center;gap:10px}
.pdf-brand-identity img{width:24px;height:34px;object-fit:contain}
.pdf-brand-identity strong{display:block;color:#342332;font-size:25px;line-height:1.1;font-weight:600;letter-spacing:-1.25px}
.pdf-brand-identity span{display:block;font-size:7px;letter-spacing:1.7px;color:#75645f;margin-top:5px}
.pdf-document{text-align:right;max-width:260px}
.pdf-document strong{display:block;font-size:9px;line-height:1.5;font-weight:500;letter-spacing:.4px;text-transform:uppercase;color:#645157}
.pdf-document small{display:block;font-size:10px;color:#76686a;margin-top:4px}

/* Asymmetric cover, with the selected assessment set apart in the margin. */
.pdf-hero{display:flex;justify-content:space-between;gap:22px;margin:0 0 18px;min-height:200px}
.pdf-hero-copy{flex:1;min-width:0;padding-top:9px}
.pdf-hero h1{font-family:Georgia,'Times New Roman',serif;font-size:49px;font-weight:400;line-height:1.05;letter-spacing:-1.9px;color:#342332;margin:17px 0 16px}
.pdf-hero h1 em{font-weight:400;color:#80553e}
.pdf-hero-copy>p{font-size:11px;line-height:1.7;color:#6e5e63;max-width:370px}
.pdf-focus{position:relative;width:209px;min-height:200px;background:#342332;color:#f7f3ed;padding:20px 23px;flex-shrink:0;overflow:hidden}
.pdf-focus::after{content:"";position:absolute;right:-36px;bottom:-38px;width:140px;height:140px;border:1px solid #785569;border-radius:50%;pointer-events:none}
.pdf-focus .pdf-kicker{color:#e4c6ac;font-size:8px;letter-spacing:1.5px}
.pdf-focus-value{font:400 77px/1 Georgia,'Times New Roman',serif;letter-spacing:-3.5px;margin:12px 0 4px;white-space:nowrap;color:#f7f3ed}
.pdf-focus-value>span{font-size:.46em;letter-spacing:-1px;margin-left:3px;color:#e4c6ac}
.pdf-focus>p{font-size:11px;letter-spacing:.2px;color:#efe5dd}
.pdf-focus-note{position:relative;font-size:9px;line-height:1.65;color:#e4c6ac;margin-top:12px;z-index:1}
.pdf-people{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:0 0 19px!important;padding:0 0 17px;border-bottom:1px solid #d8cbc0}
.pdf-people>div{min-width:0}
.pdf-people dt{font-size:8px;text-transform:uppercase;letter-spacing:1.15px;color:#7b675e}
.pdf-people dd{margin-top:5px;font-size:13px;font-weight:600;line-height:1.4;color:#342332;overflow-wrap:anywhere}
.pdf-parameters{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:0 0 18px;border-bottom:1px solid #c9b7a7;margin-bottom:20px}
.pdf-parameters>div{flex-shrink:0}
.pdf-parameters small{display:block;font-size:8px;letter-spacing:1px;color:#7b675e;margin-bottom:6px}
.pdf-parameters strong{display:block;font-size:25px;font-weight:500;line-height:1.25;letter-spacing:-.7px;white-space:nowrap;color:#342332}
.pdf-parameters>p{max-width:330px;font-size:11px;line-height:1.6;color:#58434f}
.pdf-parameters>p>span{display:block;font-size:9px;margin-top:5px;color:#77675f}
.pdf-section-heading{display:flex;justify-content:space-between;align-items:baseline;gap:25px;margin:22px 0 14px}
.pdf-section-heading h2{font:400 23px/1.25 Georgia,'Times New Roman',serif;letter-spacing:-.5px;color:#342332}
.pdf-section-heading>span{text-align:right;font-size:9px;line-height:1.6;color:#76666c}

/* Comparison matrix: consistent number alignment and horizontal rules. */
.pdf-summary{border-bottom:1px solid #bba48e;font-variant-numeric:tabular-nums}
.pdf-summary th{padding:13px 10px 12px;text-align:right;border-top:2px solid #583a55;border-bottom:1px solid #c9b7a7;color:#75615f;font-size:8px;letter-spacing:.6px;font-weight:400}
.pdf-summary th:first-child{text-align:left;width:48%;vertical-align:bottom;padding-left:0;padding-bottom:16px}
.pdf-summary.pdf-multi th:first-child{width:37%}
.pdf-summary th>span{display:block;font-size:8px;letter-spacing:1.2px;text-transform:uppercase}
.pdf-summary th strong{display:block;font:400 28px/1.2 Georgia,'Times New Roman',serif;letter-spacing:-.6px;color:#583a55;margin:4px 0}
.pdf-summary th small{font-size:8px;letter-spacing:0;font-weight:400;color:#7b6963}
.pdf-summary td{padding:17px 10px;border-bottom:1px solid #ddd1c7;vertical-align:middle;text-align:right}
.pdf-summary td:first-child{padding-left:0;text-align:left}
.pdf-summary td:last-child,.pdf-summary th:last-child{padding-right:0}
.pdf-row-name{display:flex;align-items:center;gap:12px}
.pdf-row-logo{display:flex;align-items:center;justify-content:center;width:46px;height:36px;flex-shrink:0}
.pdf-row-logo img{max-width:100%;max-height:33px;object-fit:contain}
.pdf-row-name>div:last-child{min-width:0}
.pdf-row-name strong{display:block;font-size:12px;font-weight:600;line-height:1.3;color:#342332}
.pdf-product-number{font-size:8px;letter-spacing:.5px;color:#80553e;font-weight:400;margin-right:6px}.pdf-row-name span{display:block;font-size:10px;line-height:1.4;margin-top:4px;color:#5f4b57}
.pdf-row-name small{display:block;font-size:9px;line-height:1.4;margin-top:5px;color:#7b675e}
.pdf-payout{display:inline-block;font-size:23px;line-height:1.3;font-weight:400;letter-spacing:-.8px;white-space:nowrap;color:#583a55;padding-bottom:3px}
.pdf-multi .pdf-payout{font-size:16px;letter-spacing:-.45px}
.pdf-best .pdf-payout{font-weight:700;border-bottom:2px solid #93644b}
.pdf-summary tfoot td{padding:12px 10px;border-top:1px solid #bba48e;background:#eee7de;font-size:11px;white-space:nowrap;color:#80553e;font-weight:600}
.pdf-summary tfoot td:first-child{padding-left:12px;font-size:9px;white-space:normal;line-height:1.5;color:#665050;font-weight:500}
.pdf-summary tfoot small{font-size:8px;color:#75675f}
.pdf-summary tfoot td:last-child{padding-right:10px}
.pdf-summary-key{display:flex;gap:7px;align-items:center;margin-top:10px;color:#76666c;font-size:8px;line-height:1.5}
.pdf-summary-key i{width:12px;height:2px;background:#93644b;display:block;flex-shrink:0}
.pdf-empty{padding:35px 20px;border-top:1px solid #c9b7a7;border-bottom:1px solid #c9b7a7;text-align:center;color:#76666c}
.pdf-insight{display:flex;justify-content:space-between;gap:34px;border-top:1px solid #c9b7a7;margin-top:17px;padding-top:16px}
.pdf-insight-copy{flex:1;min-width:0}
.pdf-insight-copy .pdf-kicker{font-size:8px;letter-spacing:.9px}
.pdf-insight-copy>strong{display:block;font:400 33px/1.25 Georgia,'Times New Roman',serif;letter-spacing:-1px;color:#583a55;margin:5px 0}
.pdf-insight-copy>p{font-size:9px;line-height:1.6;color:#76666c}
.pdf-comparison-figure{width:300px;flex-shrink:0}
.pdf-comparison-figure svg{width:100%;height:auto}
.pdf-insight-range{align-self:center;min-width:0}
.pdf-insight-range>span{display:block;font-size:9px;color:#76666c;margin-bottom:8px}
.pdf-insight-range>strong{display:block;font-size:16px;font-weight:500;white-space:nowrap;letter-spacing:-.3px;color:#583a55}
.pdf-insight-range i{font-style:normal;color:#93644b;margin:0 12px}

/* Compact cover variant, without shrinking product or payout text. */
.pdf-cover-dense .pdf-hero{min-height:164px;margin-bottom:18px}
.pdf-cover-dense .pdf-hero-copy{padding-top:3px}
.pdf-cover-dense .pdf-hero h1{font-size:41px;margin:12px 0}
.pdf-cover-dense .pdf-hero-copy>p{font-size:10px;line-height:1.6}
.pdf-cover-dense .pdf-focus{min-height:164px;padding:17px 22px}
.pdf-cover-dense .pdf-focus-value{font-size:62px;margin-top:10px}
.pdf-focus-value.pdf-focus-value-three{font-size:64px}.pdf-focus-value.pdf-focus-value-wide{font-size:48px;letter-spacing:-1.6px}.pdf-cover-dense .pdf-focus-value.pdf-focus-value-wide{font-size:44px}.pdf-cover-dense .pdf-focus-note{margin-top:10px;font-size:8px}
.pdf-cover-dense .pdf-people{margin-bottom:15px!important;padding-bottom:13px}
.pdf-cover-dense .pdf-parameters{padding-bottom:14px;margin-bottom:16px}
.pdf-cover-dense .pdf-summary td{padding-top:12px;padding-bottom:12px}
.pdf-cover-dense .pdf-summary tfoot td{padding-top:10px;padding-bottom:10px}
.pdf-continuation{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin:3px 0 24px}
.pdf-continuation h1{font:400 33px/1.2 Georgia,'Times New Roman',serif;letter-spacing:-.8px}
.pdf-continuation>span{font-size:9px;color:#76666c}
.pdf-continued .pdf-parameters strong{font-size:23px}
.pdf-continued .pdf-summary td{padding-top:12px;padding-bottom:12px}

/* Explanations use a product margin and a consistent reading column. */
.pdf-explanation-title{font:400 39px/1.15 Georgia,'Times New Roman',serif;letter-spacing:-1.2px;color:#342332;margin:12px 0 18px!important}
.pdf-explanation-title em{font-weight:400;color:#80553e}
.pdf-explanation-claim{font-size:12px;line-height:1.55;font-weight:600;color:#583a55;margin-bottom:8px!important}
.pdf-explanation-lead{font-size:12px;line-height:1.7;color:#6a585f;max-width:650px;margin-bottom:20px!important}
.pdf-process{display:flex;gap:22px;padding:17px 0 18px;border-top:1px solid #c9b7a7;border-bottom:1px solid #c9b7a7;margin:20px 0 10px}
.pdf-process>div{display:flex;gap:12px;align-items:center;flex:1;min-width:0}
.pdf-process>div>span{font:400 25px/1 Georgia,'Times New Roman',serif;color:#93644b}
.pdf-process strong{display:block;font-size:10px;font-weight:600;color:#583a55}
.pdf-process small{display:block;font-size:8px;margin-top:3px;color:#77645f;line-height:1.5}
.pdf-explanation-card{display:grid;grid-template-columns:145px minmax(0,1fr);gap:27px;padding:24px 0 25px;border-bottom:1px solid #c9b7a7;break-inside:avoid}
.pdf-explanation-product{padding-top:2px;min-width:0}
.pdf-explanation-product .pdf-kicker{font-size:8px;letter-spacing:1px}
.pdf-explanation-product>img{width:60px;height:41px;object-fit:contain;object-position:left center;margin:15px 0 12px}
.pdf-explanation-product h2{font:400 20px/1.2 Georgia,'Times New Roman',serif;letter-spacing:-.4px;color:#583a55;overflow-wrap:anywhere;margin-top:10px}
.pdf-product-version{margin-top:11px}
.pdf-product-version>span{display:block;font-size:9px;line-height:1.6;color:#7b675e}
.pdf-explanation-copy{min-width:0}
.pdf-explanation-copy>h3{font-size:15px;line-height:1.4;font-weight:600;letter-spacing:-.2px;color:#342332;margin-bottom:15px}
.pdf-explanation-copy>p{font-size:13px;line-height:1.65;color:#5d4756}
.pdf-explanation-copy .pdf-explanation-rule-label{font-size:8px;font-weight:600;line-height:1.5;letter-spacing:.9px;color:#80553e;margin-bottom:7px!important}
.pdf-explanation-copy .pdf-explanation-secondary{font-size:11px;line-height:1.6;color:#77645f;margin-top:10px}
.pdf-example{display:flex;justify-content:space-between;gap:18px;margin-top:18px;padding-top:14px;border-top:1px solid #dfd1c5}
.pdf-example-calculation{flex:1;min-width:0}
.pdf-example-calculation>span{display:block;font-size:8px;letter-spacing:.5px;line-height:1.5;color:#80553e}
.pdf-example .pdf-equation{font-size:12px;line-height:1.6;color:#583a55;margin-top:7px;font-variant-numeric:tabular-nums}
.pdf-example small{display:block;font-size:9px;line-height:1.6;color:#77645f;margin-top:5px}
.pdf-example>strong{font:400 26px/1.15 Georgia,'Times New Roman',serif;letter-spacing:-.75px;white-space:nowrap;color:#583a55;align-self:center}
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
.pdf-product-heading h1{font:400 32px/1.2 Georgia,'Times New Roman',serif;letter-spacing:-.75px;color:#342332;margin:8px 0 9px}
.pdf-badges{display:flex;gap:12px;flex-wrap:wrap}
.pdf-badges>span{font-size:9px;line-height:1.5;color:#7b675e}
.pdf-detail-metrics{display:flex;gap:30px;padding:16px 0;border-top:1px solid #c9b7a7;border-bottom:1px solid #c9b7a7;margin-bottom:25px}
.pdf-detail-metrics>div{flex:1}
.pdf-detail-metrics small{display:block;font-size:8px;letter-spacing:1px;line-height:1.5;color:#7b675e;margin-bottom:6px}
.pdf-detail-metrics strong{font-size:21px;font-weight:400;letter-spacing:-.5px;color:#583a55}
.pdf-section-title{font:400 25px/1.3 Georgia,'Times New Roman',serif;letter-spacing:-.4px;color:#342332;margin:22px 0 9px!important}
.pdf-intro{font-size:11px;line-height:1.7;color:#77645f;margin-bottom:12px!important}
.pdf-chart{padding:9px 0;border-top:1px solid #dfd1c5;border-bottom:1px solid #dfd1c5;margin:20px 0 23px}
.pdf-chart svg{width:100%;height:auto}
.pdf-scenario-cards{display:flex;gap:25px;margin-top:18px}
.pdf-scenario-card{flex:1;min-width:0;border-top:2px solid #583a55;padding-top:13px}
.pdf-scenario-card small{display:block;font-size:8px;letter-spacing:1px;line-height:1.5}
.pdf-scenario-card h3{font:400 21px/1.3 Georgia,'Times New Roman',serif;letter-spacing:-.3px;color:#583a55;margin:8px 0 9px}
.pdf-scenario-card strong{display:block;font-size:20px;font-weight:500;letter-spacing:-.65px;color:#583a55;white-space:nowrap}
.pdf-scenario-card p{font-size:10px;line-height:1.6;color:#77645f;margin-top:6px}
.pdf-formula{display:flex;align-items:baseline;gap:25px;border-top:1px solid #c9b7a7;margin-top:28px;padding-top:16px}
.pdf-formula strong{font-size:10px;font-weight:600;color:#80553e;flex-shrink:0}
.pdf-formula p{font-size:11px;line-height:1.7;color:#77645f}
.pdf-progression-grid{display:flex;align-items:flex-start;gap:24px;margin-top:20px}
.pdf-progression-grid>table{flex:1;width:0}
.pdf-progression th{padding:10px 9px;border-top:2px solid #583a55;border-bottom:1px solid #c9b7a7;text-align:right;font-size:10px;font-weight:500;line-height:1.45;color:#583a55}
.pdf-progression td{padding:7px 9px;border-bottom:1px solid #dfd1c5;text-align:right;font-size:11px;line-height:1.5;color:#66505b}
.pdf-progression td:first-child,.pdf-progression th:first-child{text-align:left}
.pdf-progression tr:nth-child(even) td{background:#eee7de}

.pdf-footer{position:absolute;left:46px;right:46px;bottom:27px;border-top:1px solid #c9b7a7;padding-top:12px}
.pdf-footer>p{font-size:9px;line-height:1.6;color:#76666c;margin-bottom:10px;max-width:690px}
.pdf-footer>div{display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:9px;color:#76666c}
.pdf-footer strong{color:#583a55;font-weight:600}
.pdf-footer>div>span:last-child{font-size:10px;letter-spacing:1px;color:#80553e}
.pdf-page:last-child{break-after:auto;page-break-after:auto}
@media print{.pdf-root{width:210mm}.pdf-page{width:210mm;height:297mm;break-inside:avoid;page-break-inside:avoid}@page{size:A4;margin:0}}
`;
