(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-LOAN-NOT-FOUND u201)
(define-constant ERR-INVALID-REPAYMENT u202)
(define-constant ERR-INSUFFICIENT-BALANCE u203)
(define-constant ERR-INVALID-PERCENTAGE u204)
(define-constant ERR-GRACE-PERIOD u205)
(define-constant ERR-LOAN-REPAID u206)
(define-constant ERR-INVALID-INCOME u207)
(define-constant ERR-REPORT-EXISTS u208)
(define-constant ERR-DEFAULTED u209)
(define-constant ERR-INVALID-THRESHOLD u210)
(define-constant ERR-UPDATE-NOT-ALLOWED u211)
(define-constant ERR-INVALID-CURRENCY u212)
(define-constant STATUS-ACTIVE "active")
(define-constant STATUS-REPAID "repaid")
(define-constant STATUS-DEFAULT "default")
(define-data-var authority principal tx-sender)
(define-map income-reports
  { loan-id: uint }
  {
    income: uint,
    reported-at: uint,
    verified: bool,
    threshold: uint,
    percentage: uint
  }
)
(define-map repayments
  { loan-id: uint, cycle: uint }
  {
    amount: uint,
    paid-at: uint,
    borrower: principal,
    lender: principal
  }
)
(define-map loan-states
  uint
  {
    principal: uint,
    total-due: uint,
    repaid: uint,
    status: (string-ascii 10),
    grace-until: uint,
    borrower: principal,
    lender: principal,
    currency: (string-ascii 10)
  }
)
(define-read-only (get-income-report (loan-id uint))
  (map-get? income-reports { loan-id: loan-id })
)
(define-read-only (get-loan-state (loan-id uint))
  (map-get? loan-states loan-id)
)
(define-read-only (get-repayment (loan-id uint) (cycle uint))
  (map-get? repayments { loan-id: loan-id, cycle: cycle })
)
(define-private (validate-authority)
  (is-eq tx-sender (var-get authority))
)
(define-private (validate-percentage (p uint))
  (and (> p u0) (<= p u100))
)
(define-private (validate-income (i uint))
  (> i u0)
)
(define-public (set-authority (new-auth principal))
  (begin
    (asserts! (validate-authority) (err ERR-NOT-AUTHORIZED))
    (var-set authority new-auth)
    (ok true)
  )
)
(define-public (initialize-loan
  (loan-id uint)
  (principal uint)
  (interest-rate uint)
  (grace-period uint)
  (threshold uint)
  (percentage uint)
  (borrower principal)
  (lender principal)
  (currency (string-ascii 10))
)
  (let ((total-due (+ principal (/ (* principal interest-rate) u10000))))
    (asserts! (validate-authority) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (map-get? loan-states loan-id)) (err ERR-LOAN-NOT-FOUND))
    (asserts! (validate-percentage percentage) (err ERR-INVALID-PERCENTAGE))
    (asserts! (or (is-eq currency "STX") (is-eq currency "USD")) (err ERR-INVALID-CURRENCY))
    (map-set loan-states loan-id
      {
        principal: principal,
        total-due: total-due,
        repaid: u0,
        status: STATUS-ACTIVE,
        grace-until: (+ block-height grace-period),
        borrower: borrower,
        lender: lender,
        currency: currency
      }
    )
    (ok true)
  )
)
(define-public (report-income (loan-id uint) (income uint))
  (let ((state (unwrap! (map-get? loan-states loan-id) (err ERR-LOAN-NOT-FOUND)))
        (existing (map-get? income-reports { loan-id: loan-id })))
    (asserts! (is-eq tx-sender (get borrower state)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status state) STATUS-ACTIVE) (err ERR-DEFAULTED))
    (asserts! (is-none existing) (err ERR-REPORT-EXISTS))
    (asserts! (>= block-height (get grace-until state)) (err ERR-GRACE-PERIOD))
    (asserts! (validate-income income) (err ERR-INVALID-INCOME))
    (map-set income-reports { loan-id: loan-id }
      {
        income: income,
        reported-at: block-height,
        verified: true,
        threshold: (get income-threshold state),
        percentage: (get repayment-percentage state)
      }
    )
    (ok true)
  )
)
(define-public (execute-repayment (loan-id uint) (cycle uint))
  (let ((state (unwrap! (map-get? loan-states loan-id) (err ERR-LOAN-NOT-FOUND)))
        (report (unwrap! (map-get? income-reports { loan-id: loan-id }) (err ERR-LOAN-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get borrower state)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status state) STATUS-ACTIVE) (err ERR-LOAN-REPAID))
    (asserts! (> (get income report) (get threshold report)) (err ERR-INSUFFICIENT-BALANCE))
    (let ((excess (- (get income report) (get threshold report)))
          (repay-amount (/ (* excess (get percentage report)) u100))
          (new-repaid (+ (get repaid state) repay-amount)))
      (asserts! (>= new-repaid (get total-due state)) (err ERR-LOAN-REPAID))
      (try! (as-contract (stx-transfer? repay-amount tx-sender (get lender state))))
      (map-set repayments { loan-id: loan-id, cycle: cycle }
        {
          amount: repay-amount,
          paid-at: block-height,
          borrower: tx-sender,
          lender: (get lender state)
        }
      )
      (map-set loan-states loan-id
        (merge state
          {
            repaid: new-repaid,
            status: (if (>= new-repaid (get total-due state)) STATUS-REPAID STATUS-ACTIVE)
          }
        )
      )
      (map-delete income-reports { loan-id: loan-id })
      (ok repay-amount)
    )
  )
)
(define-public (mark-default (loan-id uint))
  (let ((state (unwrap! (map-get? loan-states loan-id) (err ERR-LOAN-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get lender state)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status state) STATUS-ACTIVE) (err ERR-DEFAULTED))
    (asserts! (> (- block-height (get last-report-time state)) u100) (err ERR-UPDATE-NOT-ALLOWED))
    (map-set loan-states loan-id (merge state { status: STATUS-DEFAULT }))
    (ok true)
  )
)
(define-public (update-terms
  (loan-id uint)
  (new-threshold uint)
  (new-percentage uint)
)
  (let ((state (unwrap! (map-get? loan-states loan-id) (err ERR-LOAN-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get lender state)) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-percentage new-percentage) (err ERR-INVALID-PERCENTAGE))
    (asserts! (> new-threshold u0) (err ERR-INVALID-THRESHOLD))
    (map-set loan-states loan-id
      (merge state
        {
          income-threshold: new-threshold,
          repayment-percentage: new-percentage
        }
      )
    )
    (ok true)
  )
)