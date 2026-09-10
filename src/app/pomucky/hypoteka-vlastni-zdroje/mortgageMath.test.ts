import { describe, expect, it } from 'vitest';
import { calculateMortgageTarget, futureValue, getLiquidationValue, monthsToTarget, requiredMonthlyContribution } from './mortgageMath';

describe('mortgage own funds model', () => {
  it('bases loan on valuation and adds purchase reserve', () => {
    expect(calculateMortgageTarget(5e6, 4e6, 35, false, 100000)).toEqual({ltv:.9,mortgage:3600000,target:1500000});
    expect(calculateMortgageTarget(5e6, 5e6, 36, false, 0).target).toBe(1e6);
    expect(calculateMortgageTarget(5e6, 5e6, 25, true, 0).target).toBe(1.5e6);
    expect(calculateMortgageTarget(5e6, 10e6, 25, false, 100000).target).toBe(100000);
  });
  it('handles zero interest and month-end contributions', () => {
    expect(futureValue(100000,10000,0,12,'securities')).toBe(220000);
    expect(monthsToTarget(220000,100000,10000,0,'securities')).toBe(12);
    expect(requiredMonthlyContribution(220000,100000,0,12,'securities')).toBeCloseTo(10000,5);
  });
  it('never applies withholding tax to a negative interest rate', () => {
    expect(futureValue(100000,0,-12,1,'withholding')).toBe(99000);
    expect(futureValue(100000,0,12,1,'withholding')).toBeCloseTo(100850,6);
  });
  it('keeps recent monthly purchases taxable even after five years', () => {
    const result=getLiquidationValue(200000,10000,12,60,'securities');
    const factor=Math.pow(1.12,1/12);
    let gain=0;for(let age=0;age<=36;age++)gain+=10000*(Math.pow(factor,age)-1);
    expect(result.tax).toBeCloseTo(gain*.15,5);
    expect(result.tax).toBeGreaterThan(0);
  });
  it('uses a strict three-year holding period in the monthly model', () => {
    expect(getLiquidationValue(200000,0,10,36,'securities').tax).toBeGreaterThan(0);
    expect(getLiquidationValue(200000,0,10,37,'securities').tax).toBe(0);
  });
  it('uses total sales instead of profit for the 100k exemption', () => {
    expect(getLiquidationValue(50000,0,10,12,'securities').tax).toBe(0);
    expect(getLiquidationValue(50000,0,10,12,'securities',{otherSaleProceeds:50000}).tax).toBeCloseTo(750,5);
    expect(getLiquidationValue(100000,0,10,12,'securities').tax).toBeCloseTo(1500,5);
  });
  it('deducts entry fees and does not conceal losses', () => {
    const result=getLiquidationValue(100000,1000,-10,12,'securities',{entryFeePct:5});
    expect(result.netValue).toBeLessThan(112000);
    expect(result.tax).toBe(0);
    expect(result.reason).not.toBe('timeTest');
    expect(futureValue(100000,1000,0,12,'securities',{entryFeePct:5})).toBe(106400);
  });
  it('solves the required deposit including fees and tax', () => {
    const options={entryFeePct:3,otherSaleProceeds:100001,taxRate:.23};
    const amount=requiredMonthlyContribution(1e6,100000,8,60,'securities',options)!;
    expect(getLiquidationValue(100000,amount,8,60,'securities',options).netValue).toBeGreaterThanOrEqual(1e6);
    expect(getLiquidationValue(100000,amount-1,8,60,'securities',options).netValue).toBeLessThan(1e6);
  });
  it('handles impossible or already met targets', () => {
    expect(monthsToTarget(200000,0,0,8,'securities')).toBeNull();
    expect(monthsToTarget(100000,100000,0,0,'securities')).toBe(0);
    expect(requiredMonthlyContribution(100000,100000,0,12,'securities')).toBe(0);
  });
  it('finds the lower exempt solution near the sales threshold', () => {
    const amount=requiredMonthlyContribution(99000,50000,10,12,'securities')!;
    expect(getLiquidationValue(50000,amount,10,12,'securities').netValue).toBeGreaterThanOrEqual(99000);
    const boundary=requiredMonthlyContribution(100000,50000,10,12,'securities')!;
    expect(getLiquidationValue(50000,boundary,10,12,'securities').netValue).toBeGreaterThanOrEqual(100000);
  });
});
