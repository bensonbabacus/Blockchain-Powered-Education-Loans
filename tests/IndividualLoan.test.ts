import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PRINCIPAL = 101;
const ERR_INVALID_INTEREST_RATE = 102;
const ERR_INVALID_GRACE_PERIOD = 103;
const ERR_INVALID_INCOME_THRESHOLD = 104;
const ERR_INVALID_REPAYMENT_PERCENTAGE = 105;
const ERR_LOAN_ALREADY_DISBURSED = 106;
const ERR_LOAN_NOT_ACTIVE = 107;
const ERR_INVALID_INCOME = 108;
const ERR_GRACE_PERIOD_NOT_OVER = 109;
const ERR_INSUFFICIENT_REPAYMENT = 110;
const ERR_LOAN_ALREADY_REPAID = 111;
const ERR_INVALID_STATUS = 112;
const ERR_INVALID_BORROWER = 113;
const ERR_INVALID_LENDER = 114;
const ERR_MISSED_REPORTING = 115;
const ERR_INVALID_PROJECTION = 116;
const ERR_DEFAULT_ALREADY_SET = 117;
const ERR_INVALID_DISBURSEMENT = 118;
const ERR_INVALID_CURRENCY = 119;
const ERR_INVALID_TIMESTAMP = 120;
const ERR_MAX_LOANS_EXCEEDED = 121;
const ERR_INVALID_UPDATE_PARAM = 122;
const ERR_AUTHORITY_NOT_VERIFIED = 123;
const ERR_INVALID_MIN_REPAYMENT = 124;
const ERR_INVALID_MAX_TERM = 125;

interface Loan {
  principal: number;
  interestRate: number;
  repaid: number;
  status: string;
  graceUntil: number;
  incomeThreshold: number;
  repaymentPercentage: number;
  borrower: string;
  lenderPool: string;
  disbursementTime: number;
  lastReportTime: number;
  totalDue: number;
  minRepayment: number;
  maxTerm: number;
  currency: string;
}

interface LoanUpdate {
  updateInterestRate: number;
  updateGraceUntil: number;
  updateIncomeThreshold: number;
  updateTimestamp: number;
  updater: string;
}

interface IncomeReport {
  reportedIncome: number;
  reportTime: number;
  verified: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class IndividualLoanContractMock {
  state: {
    nextLoanId: number;
    maxLoans: number;
    disbursementFee: number;
    authorityContract: string | null;
    loans: Map<number, Loan>;
    loanUpdates: Map<number, LoanUpdate>;
    incomeReports: Map<number, IncomeReport>;
  } = {
    nextLoanId: 0,
    maxLoans: 5000,
    disbursementFee: 500,
    authorityContract: null,
    loans: new Map(),
    loanUpdates: new Map(),
    incomeReports: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1BORROWER";
  authorities: Set<string> = new Set(["ST1BORROWER"]);
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextLoanId: 0,
      maxLoans: 5000,
      disbursementFee: 500,
      authorityContract: null,
      loans: new Map(),
      loanUpdates: new Map(),
      incomeReports: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1BORROWER";
    this.authorities = new Set(["ST1BORROWER"]);
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === this.caller) {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxLoans(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxLoans = newMax;
    return { ok: true, value: true };
  }

  setDisbursementFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.disbursementFee = newFee;
    return { ok: true, value: true };
  }

  createLoan(
    principalAmount: number,
    interestRate: number,
    gracePeriod: number,
    incomeThreshold: number,
    repaymentPercentage: number,
    borrower: string,
    lenderPool: string,
    minRepayment: number,
    maxTerm: number,
    currency: string
  ): Result<number> {
    if (this.state.nextLoanId >= this.state.maxLoans) return { ok: false, value: ERR_MAX_LOANS_EXCEEDED };
    if (interestRate <= 0 || interestRate > 1000) return { ok: false, value: ERR_INVALID_INTEREST_RATE };
    if (gracePeriod <= 0) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (incomeThreshold <= 0) return { ok: false, value: ERR_INVALID_INCOME_THRESHOLD };
    if (repaymentPercentage <= 0 || repaymentPercentage > 50) return { ok: false, value: ERR_INVALID_REPAYMENT_PERCENTAGE };
    if (borrower === this.caller) return { ok: false, value: ERR_INVALID_BORROWER };
    if (lenderPool === this.caller) return { ok: false, value: ERR_INVALID_LENDER };
    if (minRepayment <= 0) return { ok: false, value: ERR_INVALID_MIN_REPAYMENT };
    if (maxTerm <= 0) return { ok: false, value: ERR_INVALID_MAX_TERM };
    if (!["STX", "USD"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.stxTransfers.push({ amount: this.state.disbursementFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextLoanId;
    const totalDue = principalAmount + Math.floor((principalAmount * interestRate) / 10000);
    const loan: Loan = {
      principal: principalAmount,
      interestRate,
      repaid: 0,
      status: "pending",
      graceUntil: this.blockHeight + gracePeriod,
      incomeThreshold,
      repaymentPercentage,
      borrower,
      lenderPool,
      disbursementTime: 0,
      lastReportTime: 0,
      totalDue,
      minRepayment,
      maxTerm,
      currency,
    };
    this.state.loans.set(id, loan);
    this.state.nextLoanId++;
    return { ok: true, value: id };
  }

  disburseLoan(id: number): Result<boolean> {
    const loan = this.state.loans.get(id);
    if (!loan) return { ok: false, value: false };
    if (loan.status !== "pending") return { ok: false, value: false };
    if (this.caller !== loan.lenderPool) return { ok: false, value: false };
    this.stxTransfers.push({ amount: loan.principal, from: this.caller, to: loan.borrower });
    const updated: Loan = { ...loan, status: "active", disbursementTime: this.blockHeight };
    this.state.loans.set(id, updated);
    return { ok: true, value: true };
  }

  reportIncome(id: number, income: number): Result<boolean> {
    const loan = this.state.loans.get(id);
    if (!loan) return { ok: false, value: false };
    if (this.caller !== loan.borrower) return { ok: false, value: false };
    if (loan.status !== "active") return { ok: false, value: false };
    if (income <= 0) return { ok: false, value: false };
    if (this.blockHeight < loan.graceUntil) return { ok: false, value: false };
    this.state.incomeReports.set(id, { reportedIncome: income, reportTime: this.blockHeight, verified: true });
    const updated: Loan = { ...loan, lastReportTime: this.blockHeight };
    this.state.loans.set(id, updated);
    return { ok: true, value: true };
  }

  triggerRepayment(id: number): Result<boolean> {
    const loan = this.state.loans.get(id);
    const report = this.state.incomeReports.get(id);
    if (!loan || !report) return { ok: false, value: false };
    if (loan.status !== "active") return { ok: false, value: false };
    if (report.reportedIncome <= loan.incomeThreshold) return { ok: false, value: false };
    const excess = report.reportedIncome - loan.incomeThreshold;
    const repayAmount = Math.floor((excess * loan.repaymentPercentage) / 100);
    const newRepaid = loan.repaid + repayAmount;
    if (newRepaid > loan.totalDue) return { ok: false, value: false };
    this.stxTransfers.push({ amount: repayAmount, from: this.caller, to: loan.lenderPool });
    let updated: Loan = { ...loan, repaid: newRepaid };
    if (newRepaid >= loan.totalDue) {
      updated = { ...updated, status: "repaid" };
    }
    this.state.loans.set(id, updated);
    return { ok: true, value: true };
  }

  defaultLoan(id: number): Result<boolean> {
    const loan = this.state.loans.get(id);
    if (!loan) return { ok: false, value: false };
    if (this.caller !== loan.lenderPool) return { ok: false, value: false };
    if (loan.status !== "active") return { ok: false, value: false };
    if (this.blockHeight - loan.lastReportTime <= 100) return { ok: false, value: false };
    const updated: Loan = { ...loan, status: "default" };
    this.state.loans.set(id, updated);
    return { ok: true, value: true };
  }

  updateLoan(id: number, newInterestRate: number, newGraceUntil: number, newIncomeThreshold: number): Result<boolean> {
    const loan = this.state.loans.get(id);
    if (!loan) return { ok: false, value: false };
    if (this.caller !== loan.lenderPool) return { ok: false, value: false };
    if (newInterestRate <= 0 || newInterestRate > 1000) return { ok: false, value: false };
    if (newGraceUntil < this.blockHeight) return { ok: false, value: false };
    if (newIncomeThreshold <= 0) return { ok: false, value: false };
    const updated: Loan = {
      ...loan,
      interestRate: newInterestRate,
      graceUntil: newGraceUntil,
      incomeThreshold: newIncomeThreshold,
    };
    this.state.loans.set(id, updated);
    this.state.loanUpdates.set(id, {
      updateInterestRate: newInterestRate,
      updateGraceUntil: newGraceUntil,
      updateIncomeThreshold: newIncomeThreshold,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getLoanCount(): Result<number> {
    return { ok: true, value: this.state.nextLoanId };
  }

  getLoan(id: number): Loan | null {
    return this.state.loans.get(id) || null;
  }
}

describe("IndividualLoanContract", () => {
  let contract: IndividualLoanContractMock;

  beforeEach(() => {
    contract = new IndividualLoanContractMock();
    contract.reset();
  });

  it("rejects loan creation without authority", () => {
    const result = contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid interest rate", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.createLoan(
      10000,
      1500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_INTEREST_RATE);
  });

  it("disburses loan successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    const result = contract.disburseLoan(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const loan = contract.getLoan(0);
    expect(loan?.status).toBe("active");
    expect(loan?.disbursementTime).toBe(0);
    expect(contract.stxTransfers[1]).toEqual({ amount: 10000, from: "ST4LENDER", to: "ST3BORROWER" });
  });

  it("rejects disbursement by unauthorized", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    const result = contract.disburseLoan(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("reports income successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.caller = "ST3BORROWER";
    contract.blockHeight = 101;
    const result = contract.reportIncome(0, 60000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const report = contract.state.incomeReports.get(0);
    expect(report?.reportedIncome).toBe(60000);
    expect(report?.reportTime).toBe(101);
    expect(report?.verified).toBe(true);
    const loan = contract.getLoan(0);
    expect(loan?.lastReportTime).toBe(101);
  });

  it("rejects income report before grace period", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.caller = "ST3BORROWER";
    contract.blockHeight = 50;
    const result = contract.reportIncome(0, 60000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("triggers repayment successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.caller = "ST3BORROWER";
    contract.blockHeight = 101;
    contract.reportIncome(0, 60000);
    const result = contract.triggerRepayment(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const loan = contract.getLoan(0);
    expect(loan?.repaid).toBe(1000);
    expect(contract.stxTransfers[2]).toEqual({ amount: 1000, from: "ST3BORROWER", to: "ST4LENDER" });
  });

  it("defaults loan successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.blockHeight = 200;
    const result = contract.defaultLoan(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const loan = contract.getLoan(0);
    expect(loan?.status).toBe("default");
  });

  it("rejects default if not missed reporting", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.caller = "ST3BORROWER";
    contract.blockHeight = 101;
    contract.reportIncome(0, 60000);
    contract.caller = "ST4LENDER";
    contract.blockHeight = 150;
    const result = contract.defaultLoan(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates loan successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.blockHeight = 50;
    const result = contract.updateLoan(0, 600, 150, 55000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const loan = contract.getLoan(0);
    expect(loan?.interestRate).toBe(600);
    expect(loan?.graceUntil).toBe(150);
    expect(loan?.incomeThreshold).toBe(55000);
    const update = contract.state.loanUpdates.get(0);
    expect(update?.updateInterestRate).toBe(600);
    expect(update?.updateGraceUntil).toBe(150);
    expect(update?.updateIncomeThreshold).toBe(55000);
    expect(update?.updateTimestamp).toBe(50);
    expect(update?.updater).toBe("ST4LENDER");
  });

  it("rejects update with invalid timestamp", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.caller = "ST4LENDER";
    contract.disburseLoan(0);
    contract.blockHeight = 50;
    const result = contract.updateLoan(0, 600, 40, 55000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct loan count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    contract.createLoan(
      20000,
      600,
      200,
      60000,
      15,
      "ST5BORROWER",
      "ST6LENDER",
      200,
      720,
      "USD"
    );
    const result = contract.getLoanCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("sets disbursement fee successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setDisbursementFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.disbursementFee).toBe(1000);
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1BORROWER", to: "ST2AUTH" }]);
  });

  it("rejects max loans exceeded", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.state.maxLoans = 1;
    contract.createLoan(
      10000,
      500,
      100,
      50000,
      10,
      "ST3BORROWER",
      "ST4LENDER",
      100,
      360,
      "STX"
    );
    const result = contract.createLoan(
      20000,
      600,
      200,
      60000,
      15,
      "ST5BORROWER",
      "ST6LENDER",
      200,
      720,
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_LOANS_EXCEEDED);
  });
});