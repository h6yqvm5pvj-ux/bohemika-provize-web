export const LIFE_INSURANCE_REPORT_STYLES = `
* { box-sizing: border-box; }
body { margin: 0; padding: 22px; background: #edf0f3; font-family: Arial, Helvetica, sans-serif; color: #334858; font-size: 12px; line-height: 1.5; }
.page { width: 760px; margin: 0 auto; padding: 25px 30px; background: #fff; box-shadow: 0 3px 22px #213b4a0c; }
.report-layout { width: 100%; border-collapse: collapse; table-layout: fixed; }
.report-layout > thead > tr > td, .report-layout > tbody > tr > td { padding: 0; vertical-align: top; }
.report-layout > thead { display: table-header-group; break-inside: avoid; }
.report-hero { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding-bottom: 18px; margin-bottom: 20px; border-bottom: 2px solid #61b5d7; }
.brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.brand img { display: block; object-fit: contain; }
.brand strong { display: block; font-size: 25px; letter-spacing: -.8px; font-weight: 700; color: #304654; }
.brand strong span { font-size: 14px; font-weight: 400; color: #657c8c; }
.brand small { display: block; font-size: 7px; letter-spacing: .18em; color: #657c8c; }
.document-meta { max-width: 270px; text-align: right; font-size: 9px; color: #657c8c; overflow-wrap: anywhere; }
.document-meta strong { display: block; color: #638498; font-size: 11px; font-weight: 600; }
.document-meta span { display: block; margin-top: 3px; }
.document-intro { margin-bottom: 19px; }
.eyebrow { text-transform: uppercase; letter-spacing: .14em; color: #77a6bb; font-size: 8px; }
h1 { margin: 5px 0 10px; font-size: 30px; line-height: 1.25; font-weight: 700; letter-spacing: -1px; color: #29465a; }
p { margin: 5px 0 0; }
.document-intro > p { max-width: 620px; color: #657c8c; font-size: 10px; line-height: 1.7; }
.client-line { display: flex; flex-wrap: wrap; gap: 7px 20px; margin-top: 15px; padding-top: 12px; border-top: 1px solid #e7edf1; font-size: 9px; color: #657c8c; }
.client-line strong { color: #647c8d; font-weight: 600; }
.report-totals { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin-bottom: 22px; padding: 16px 0; background: #f3f8fa; border-top: 1px solid #e1ecf1; border-bottom: 1px solid #e1ecf1; }
.report-totals > div { padding: 0 15px; border-left: 1px solid #dce8ef; }
.report-totals > div:first-child { border: 0; }
.report-totals span { display: block; font-size: 8px; color: #657c8c; }
.report-totals strong { display: block; margin-top: 5px; font-size: 22px; color: #456f85; font-weight: 700; font-variant-numeric: tabular-nums; }
.report-section { margin-top: 24px; }
.section-title { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin: 0 0 10px; font-size: 15px; font-weight: 700; color: #3f6379; break-after: avoid; }
.section-title b { display: inline-flex; align-items: center; justify-content: center; height: 22px; width: 25px; border-radius: 5px; color: #75a0b5; background: #f0f6f9; font-size: 10px; font-weight: 600; }
.section-title > span { margin-left: auto; max-width: 330px; font-size: 9px; color: #657c8c; font-weight: 400; }
.summary-list { border-top: 1px solid #dbe6ec; border-bottom: 1px solid #dbe6ec; }
.category-line { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: start; gap: 20px; padding: 13px 0; border-top: 1px solid #e8eff3; break-inside: avoid; }
.category-line:first-child { border: 0; }
.category-line strong { color: #597587; font-size: 11px; font-weight: 600; }
.category-line p { max-width: 460px; color: #657c8c; font-size: 9px; line-height: 1.7; }
.category-line > span { font-size: 17px; font-weight: 700; color: #3e819e; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.note { margin: 11px 0 0; padding: 10px 13px; color: #657c8c; border-left: 2px solid #bcdbe8; background: #f7fafb; font-size: 9px; line-height: 1.7; }
.note strong { color: #668899; font-weight: 600; }
.model-note { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 5px 16px; margin: 12px 0; font-size: 9px; color: #657c8c; }
.model-note strong { color: #6b899a; }
.product-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
.product-table thead { display: table-header-group; }
.product-table th { padding: 9px 12px; text-align: left; font-size: 9px; font-weight: 600; color: #7796a8; background: #f0f6f9; border-bottom: 1px solid #d9e6ed; }
.product-table th:first-child { width: 17%; }
.product-table th:nth-child(2) { width: 24%; }
.product-table th:nth-child(3) { width: 24%; }
.product-table th:last-child { width: 35%; text-align: right; }
.product-table td { padding: 13px 12px; border-bottom: 1px solid #e5ecf0; color: #698193; font-size: 11px; font-variant-numeric: tabular-nums; }
.product-table td:last-child { font-weight: 700; text-align: right; color: #3f819e; }
.product-table small { display: block; margin-top: 3px; color: #657c8c; font-size: 8px; font-weight: 400; }
.product-table .pension-average { background: #f7fafc; color: #456f85; font-weight: 600; }
.product-table .pension-personal { background: #f6f0fa; color: #78538f; font-weight: 600; }
.pension-source { margin-top: 10px; color: #657c8c; font-size: 8px; line-height: 1.7; }
.pension-source a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.product-table tr { break-inside: avoid; }
.loan { margin-top: 13px; }
.inputs { margin-top: 26px; }
.inputs .section-title { font-size: 12px; }
.inputs dl { display: grid; grid-template-columns: 1fr 1fr; column-gap: 30px; margin: 0; }
.inputs dl > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #edf1f4; font-size: 9px; }
.inputs dt { color: #657c8c; }
.inputs dd { color: #6d889a; margin: 0; font-weight: 600; }
.footer-note { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-top: 25px; padding-top: 16px; border-top: 2px solid #dceaf1; break-inside: avoid; }
.footer-note small { display: block; font-size: 8px; color: #657c8c; }
.footer-note strong { display: block; margin: 2px 0; font-size: 15px; color: #51778c; }
.footer-note span { display: block; font-size: 9px; color: #657c8c; }
.contacts { max-width: 360px; text-align: right; overflow-wrap: anywhere; }
.contacts span { margin-bottom: 3px; }
.info-card, .report-totals, .summary-list { break-inside: avoid; }
@page { size: A4; margin: 12mm; }
@media print { body { padding: 0; background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; } .page { width: 100%; padding: 0; margin: 0; box-shadow: none; } .report-layout > tbody > tr { break-inside: auto; } }

.section-illustration { display: block; width: 94px; height: 94px; object-fit: contain; margin-left: 8px; flex-shrink: 0; }
.sicknessBreakdown { padding-top: 20px; color: #344758; }
.benefitHeading { display: block; margin: 0 0 12px; }
.benefitHeading h3 { margin: 0; font-size: 14px; font-weight: 650; }
.benefitHeading p { margin-top: 5px; font-size: 9px; font-weight: 400; color: #657c8c; }

.benefitPayers { display: grid; grid-template-columns: .9fr 1.1fr; gap: 16px; }
.employerPayment, .statePayment { min-width: 0; padding: 22px; border: 1px solid #e5dcee; border-radius: 14px; background: #faf7fd; }
.statePayment { background: #f6f9fc; border-color: #dee7ef; }
.benefitPayers h4 { margin: 0; font-size: 17px; font-weight: 650; color: #344758; }
.benefitPayers p { margin: 5px 0 0; font-size: 12px; line-height: 1.6; color: #627489; }
.employerAmount { margin-top: 24px; }
.employerAmount > span { display: block; font-size: 13px; color: #615371; }
.employerAmount > strong { display: block; margin: 7px 0 2px; font-size: 32px; line-height: 1.25; font-weight: 650; letter-spacing: -.7px; color: #5e3e7a; font-variant-numeric: tabular-nums; }
.employerAmount > small, .workSchedule { display: block; font-size: 11px; line-height: 1.7; color: #6a5c78; }
.workSchedule { margin-top: 17px; }
.statePeriods { margin: 14px 0 0; }
.statePeriods > div { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 14px; padding: 12px 0; border-bottom: 1px solid #e0e8ef; }
.statePeriods > div:last-child { border-bottom: 0; padding-bottom: 0; }
.statePeriods dt { font-size: 13px; color: #536c81; }
.benefitRate { display: inline-block; margin-left: 7px; padding: 2px 5px; border-radius: 4px; background: #e6eef5; color: #3e6280; font-size: 9px; font-weight: 650; line-height: 1.5; white-space: nowrap; vertical-align: middle; }
.employerPayment .benefitRate { background: #eee5f6; color: #6b4788; }
.statePeriods dd { margin: 0; font-size: 23px; line-height: 1.3; font-weight: 650; letter-spacing: -.4px; color: #345f7d; font-variant-numeric: tabular-nums; }
.firstMonthTotal { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 18px; margin-top: 20px; padding: 16px 0; border-bottom: 1px solid #e5eaf0; }
.firstMonthTotal > span { font-size: 14px; font-weight: 550; color: #455c72; }
.firstMonthTotal > strong { font-size: 26px; font-weight: 650; letter-spacing: -.5px; color: #304b63; font-variant-numeric: tabular-nums; }
.benefitBasis { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 16px; font-size: 11px; color: #63758a; }
.benefitBasis b { font-weight: 600; color: #445e74; }
.benefitNote { margin: 12px 0 0; font-size: 11px; line-height: 1.7; color: #697b8c; }
.benefitDetails { margin-top: 12px; }
.benefitDetails summary { width: fit-content; cursor: pointer; font-size: 12px; font-weight: 550; color: #506a84; padding: 4px 0; }
.benefitDetails summary:focus-visible { outline: 3px solid #bba0de; outline-offset: 3px; border-radius: 3px; }
.benefitDailyRates { padding-left: 18px; margin: 12px 0 0; list-style: disc; font-size: 11px; line-height: 1.8; color: #63758a; }
.benefitSources { margin-top: 9px; font-size: 10px; color: #6c7e8d; }
.benefitSources a { text-decoration: underline; text-underline-offset: 3px; }

.benefitPayers { gap: 12px; }
.employerPayment, .statePayment { padding: 16px; border-radius: 9px; }
.benefitPayers h4 { font-size: 13px; }
.benefitPayers p { font-size: 9px; }
.employerAmount { margin-top: 17px; }
.employerAmount > span, .statePeriods dt { font-size: 10px; }
.employerAmount > strong { font-size: 25px; }
.employerAmount > small, .workSchedule { font-size: 9px; }
.workSchedule { margin-top: 12px; }
.statePeriods { margin-top: 8px; }
.statePeriods > div { padding: 9px 0; }
.statePeriods dd { font-size: 18px; }
.firstMonthTotal { margin-top: 10px; padding: 12px 0; }
.firstMonthTotal > span { font-size: 11px; }
.firstMonthTotal > strong { font-size: 21px; }
.benefitNote { font-size: 9px; line-height: 1.7; }
`;
