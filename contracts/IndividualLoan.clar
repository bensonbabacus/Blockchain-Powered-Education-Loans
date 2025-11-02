individual-loan-contract.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PRINCIPAL u101)
(define-constant ERR-INVALID-INTEREST-RATE u102)
(define-constant ERR-INVALID-GRACE-PERIOD u103)
(define-constant ERR-INVALID-INCOME-THRESHOLD u104)
(define-constant ERR-INVALID-REPAYMENT-PERCENTAGE u105)
(define-constant ERR-LOAN-ALREADY-DISBURSED u106)
(define-constant ERR-LOAN-NOT-ACTIVE u107)
(define-constant ERR-INVALID-INCOME u108)
(define-constant ERR-GRACE-PERIOD-NOT-OVER u109)
(define-constant ERR-INSUFFICIENT-REPAYMENT u110)
(define-constant ERR-LOAN-ALREADY-REPAID u111)
(define-constant ERR-INVALID-STATUS u112)
(define-constant ERR-INVALID-BORROWER u113)
(define-constant ERR-INVALID-LENDER u114)
(define-constant ERR-MISSED-REPORTING u115)
(define-constant ERR-INVALID-PROJECTION u116)
(define-constant ERR-DEFAULT-ALREADY_SET u117)
(define-constant ERR-INVALID-DISBURSEMENT u118)
(define-constant ERR-INVALID-CURRENCY u119)
(define-constant ERR-INVALID-TIMESTAMP u120)
(define-constant ERR-MAX-LOANS_EXCEEDED u121)
(define-constant ERR-INVALID-UPDATE-PARAM u122)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u123)
(define-constant ERR-INVALID-MIN-REPAYMENT u124)
(define-constant ERR-INVALID-MAX-TERM u125)
(define-constant STATUS-PENDING "pending")
(define-constant STATUS-ACTIVE "active")
(define-constant STATUS-DEFAULT "default")
(define-constant STATUS-REPAID "repaid")
(define-data-var next-loan-id uint u0)
(define-data-var max-loans uint u5000)
(define-data-var disbursement-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-map loans
  uint
  {
    principal: uint,
    interest-rate: uint,
    repaid: uint,
    status: (string-ascii 20),
    grace-until: uint,
    income-threshold: uint,
    repayment-percentage: uint,
    borrower: principal,
    lender-pool: principal,
    disbursement-time: uint,
    last-report-time: uint,
    total-due: uint,
    min-repayment: uint,
    max-term: uint,
    currency: (string-ascii 10)
  }
)
(define-map loan-updates
  uint
  {
    update-interest-rate: uint,
    update-grace-until: uint,
    update-income-threshold: uint,
    update-timestamp: uint,
    updater: principal
  }
)
(define-map income-reports
  uint
  {
    reported-income: uint,
    report-time: uint,
    verified: bool
  }
)
(define-read-only (get-loan (id uint))
  (map-get? loans id)
)
(define-read-only (get-loan-update (id uint))
  (map-get? loan-updates id)
)
(define-read-only (get-income-report (id uint))
  (map-get? income-reports id)
)
(define-private (validate-principal (p principal))
  (if (not (is-eq p contract-caller))
    (ok true)
    (err ERR-NOT-AUTHORIZED)
  )
)
(define-private (validate-interest-rate (rate uint))
  (if (and (> rate u0) (<= rate u1000))
    (ok true)
    (err ERR-INVALID-INTEREST-RATE)
  )
)
(define-private (validate-grace-period (period uint))
  (if (> period u0)
    (ok true)
    (err ERR-INVALID-GRACE-PERIOD)
  )
)
(define-private (validate-income-threshold (threshold uint))
  (if (> threshold u0)
    (ok true)
    (err ERR-INVALID-INCOME-THRESHOLD)
  )
)
(define-private (validate-repayment-percentage (perc uint))
  (if (and (> perc u0) (<= perc u50))
    (ok true)
    (err ERR-INVALID-REPAYMENT-PERCENTAGE)
  )
)
(define-private (validate-status (stat (string-ascii 20)))
  (if (or (is-eq stat STATUS-PENDING) (is-eq stat STATUS-ACTIVE) (is-eq stat STATUS-DEFAULT) (is-eq stat STATUS-REPAID))
    (ok true)
    (err ERR-INVALID-STATUS)
  )
)
(define-private (validate-income (income uint))
  (if (> income u0)
    (ok true)
    (err ERR-INVALID-INCOME)
  )
)
(define-private (validate-currency (cur (string-ascii 10)))
  (if (or (is-eq cur "STX") (is-eq cur "USD"))
    (ok true)
    (err ERR-INVALID-CURRENCY)
  )
)
(define-private (validate-min-repayment (min uint))
  (if (> min u0)
    (ok true)
    (err ERR-INVALID-MIN-REPAYMENT)
  )
)
(define-private (validate-max-term (term uint))
  (if (> term u0)
    (ok true)
    (err ERR-INVALID-MAX-TERM)
  )
)
(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP)
  )
)
(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)
(define-public (set-max-loans (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-LOANS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-loans new-max)
    (ok true)
  )
)
(define-public (set-disbursement-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set disbursement-fee new-fee)
    (ok true)
  )
)
(define-public (create-loan
  (principal-amount uint)
  (interest-rate uint)
  (grace-period uint)
  (income-threshold uint)
  (repayment-percentage uint)
  (borrower principal)
  (lender-pool principal)
  (min-repayment uint)
  (max-term uint)
  (currency (string-ascii 10))
)
  (let (
    (next-id (var-get next-loan-id))
    (current-max (var-get max-loans))
    (authority (var-get authority-contract))
  )
    (asserts! (< next-id current-max) (err ERR-MAX-LOANS-EXCEEDED))
    (try! (validate-interest-rate interest-rate))
    (try! (validate-grace-period grace-period))
    (try! (validate-income-threshold income-threshold))
    (try! (validate-repayment-percentage repayment-percentage))
    (try! (validate-principal borrower))
    (try! (validate-principal lender-pool))
    (try! (validate-min-repayment min-repayment))
    (try! (validate-max-term max-term))
    (try! (validate-currency currency))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get disbursement-fee) tx-sender authority-recipient))
    )
    (map-set loans next-id
      {
        principal: principal-amount,
        interest-rate: interest-rate,
        repaid: u0,
        status: STATUS-PENDING,
        grace-until: (+ block-height grace-period),
        income-threshold: income-threshold,
        repayment-percentage: repayment-percentage,
        borrower: borrower,
        lender-pool: lender-pool,
        disbursement-time: u0,
        last-report-time: u0,
        total-due: (+ principal-amount (/ (* principal-amount interest-rate) u10000)),
        min-repayment: min-repayment,
        max-term: max-term,
        currency: currency
      }
    )
    (var-set next-loan-id (+ next-id u1))
    (print { event: "loan-created", id: next-id })
    (ok next-id)
  )
)
(define-public (disburse-loan (id uint))
  (let ((loan (map-get? loans id)))
    (match loan
      l
      (begin
        (asserts! (is-eq (get status l) STATUS-PENDING) (err ERR-LOAN-NOT-ACTIVE))
        (asserts! (is-eq tx-sender (get lender-pool l)) (err ERR-NOT-AUTHORIZED))
        (try! (as-contract (stx-transfer? (get principal l) tx-sender (get borrower l))))
        (map-set loans id (merge l { status: STATUS-ACTIVE, disbursement-time: block-height }))
        (print { event: "loan-disbursed", id: id })
        (ok true)
      )
      (err ERR-LOAN-NOT-ACTIVE)
    )
  )
)
(define-public (report-income (id uint) (income uint))
  (let ((loan (map-get? loans id)))
    (match loan
      l
      (begin
        (asserts! (is-eq tx-sender (get borrower l)) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status l) STATUS-ACTIVE) (err ERR-LOAN-NOT-ACTIVE))
        (try! (validate-income income))
        (asserts! (>= block-height (get grace-until l)) (err ERR-GRACE-PERIOD-NOT-OVER))
        (map-set income-reports id { reported-income: income, report-time: block-height, verified: true })
        (map-set loans id (merge l { last-report-time: block-height }))
        (print { event: "income-reported", id: id, income: income })
        (ok true)
      )
      (err ERR-LOAN-NOT-ACTIVE)
    )
  )
)
(define-public (trigger-repayment (id uint))
  (let ((loan (map-get? loans id)) (report (map-get? income-reports id)))
    (match loan
      l
      (match report
        r
        (begin
          (asserts! (is-eq (get status l) STATUS-ACTIVE) (err ERR-LOAN-NOT-ACTIVE))
          (asserts! (> (get reported-income r) (get income-threshold l)) (err ERR-INSUFFICIENT-REPAYMENT))
          (let (
            (excess (- (get reported-income r) (get income-threshold l)))
            (repay-amount (/ (* excess (get repayment-percentage l)) u100))
            (new-repaid (+ (get repaid l) repay-amount))
            (new-total-due (get total-due l))
          )
            (asserts! (<= new-repaid new-total-due) (err ERR-LOAN-ALREADY-REPAID))
            (try! (stx-transfer? repay-amount tx-sender (get lender-pool l)))
            (map-set loans id (merge l { repaid: new-repaid }))
            (if (>= new-repaid new-total-due)
              (begin
                (map-set loans id (merge l { status: STATUS-REPAID }))
                (print { event: "loan-repaid", id: id })
              )
              (print { event: "repayment-triggered", id: id, amount: repay-amount })
            )
            (ok true)
          )
        )
        (err ERR-MISSED-REPORTING)
      )
      (err ERR-LOAN-NOT-ACTIVE)
    )
  )
)
(define-public (default-loan (id uint))
  (let ((loan (map-get? loans id)))
    (match loan
      l
      (begin
        (asserts! (is-eq tx-sender (get lender-pool l)) (err ERR-NOT-AUTHORIZED))
        (asserts! (is-eq (get status l) STATUS-ACTIVE) (err ERR-LOAN-NOT-ACTIVE))
        (asserts! (> (- block-height (get last-report-time l)) u100) (err ERR-MISSED-REPORTING))
        (map-set loans id (merge l { status: STATUS-DEFAULT }))
        (print { event: "loan-defaulted", id: id })
        (ok true)
      )
      (err ERR-LOAN-NOT-ACTIVE)
    )
  )
)
(define-public (update-loan
  (id uint)
  (new-interest-rate uint)
  (new-grace-until uint)
  (new-income-threshold uint)
)
  (let ((loan (map-get? loans id)))
    (match loan
      l
      (begin
        (asserts! (is-eq tx-sender (get lender-pool l)) (err ERR-NOT-AUTHORIZED))
        (try! (validate-interest-rate new-interest-rate))
        (try! (validate-timestamp new-grace-until))
        (try! (validate-income-threshold new-income-threshold))
        (map-set loans id
          (merge l {
            interest-rate: new-interest-rate,
            grace-until: new-grace-until,
            income-threshold: new-income-threshold
          })
        )
        (map-set loan-updates id
          {
            update-interest-rate: new-interest-rate,
            update-grace-until: new-grace-until,
            update-income-threshold: new-income-threshold,
            update-timestamp: block-height,
            updater: tx-sender
          }
        )
        (print { event: "loan-updated", id: id })
        (ok true)
      )
      (err ERR-LOAN-NOT-ACTIVE)
    )
  )
)
(define-public (get-loan-count)
  (ok (var-get next-loan-id))
)
