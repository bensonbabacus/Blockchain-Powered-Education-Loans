(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-DEGREE u301)
(define-constant ERR-INVALID-LOCATION u302)
(define-constant ERR-INVALID-YEARS u303)
(define-constant ERR-INVALID-SALARY u304)
(define-constant ERR-PROJECTION-EXISTS u305)
(define-constant ERR-PROJECTION-NOT-FOUND u306)
(define-constant ERR-INVALID-CONFIDENCE u307)
(define-constant ERR-INVALID-UPDATE-PARAM u308)
(define-constant ERR-INVALID-CURRENCY u309)
(define-constant ERR-MAX-PROJECTIONS u310)
(define-constant ERR-ORACLE-NOT-SET u311)
(define-data-var oracle-principal principal tx-sender)
(define-data-var max-projections uint u10000)
(define-data-var update-fee uint u100)
(define-map degree-salary
  { degree: (string-utf8 50), location: (string-utf8 50) }
  {
    avg-salary: uint,
    median-salary: uint,
    confidence: uint,
    last-updated: uint,
    data-points: uint
  }
)
(define-map projections
  uint
  {
    student: principal,
    degree: (string-utf8 50),
    location: (string-utf8 50),
    years-experience: uint,
    projected-salary: uint,
    confidence-score: uint,
    created-at: uint,
    updated-at: uint,
    currency: (string-ascii 10)
  }
)
(define-data-var next-projection-id uint u0)
(define-read-only (get-degree-salary (degree (string-utf8 50)) (location (string-utf8 50)))
  (map-get? degree-salary { degree: degree, location: location })
)
(define-read-only (get-projection (id uint))
  (map-get? projections id)
)
(define-read-only (get-next-id)
  (var-get next-projection-id)
)
(define-private (validate-oracle)
  (is-eq tx-sender (var-get oracle-principal))
)
(define-private (validate-degree (d (string-utf8 50)))
  (and (> (len d) u0) (<= (len d) u50))
)
(define-private (validate-location (l (string-utf8 50)))
  (and (> (len l) u0) (<= (len l) u50))
)
(define-private (validate-years (y uint))
  (<= y u10)
)
(define-private (validate-salary (s uint))
  (> s u0)
)
(define-private (validate-confidence (c uint))
  (and (>= c u0) (<= c u100))
)
(define-private (validate-currency (c (string-ascii 10)))
  (or (is-eq c "STX") (is-eq c "USD"))
)
(define-public (set-oracle (new-oracle principal))
  (begin
    (asserts! (validate-oracle) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-principal new-oracle)
    (ok true)
  )
)
(define-public (set-max-projections (new-max uint))
  (begin
    (asserts! (validate-oracle) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-projections new-max)
    (ok true)
  )
)
(define-public (set-update-fee (new-fee uint))
  (begin
    (asserts! (validate-oracle) (err ERR-NOT-AUTHORIZED))
    (var-set update-fee new-fee)
    (ok true)
  )
)
(define-public (update-degree-salary
  (degree (string-utf8 50))
  (location (string-utf8 50))
  (avg-salary uint)
  (median-salary uint)
  (confidence uint)
)
  (begin
    (asserts! (validate-oracle) (err ERR-NOT-AUTHORIZED))
    (try! (validate-degree degree))
    (try! (validate-location location))
    (try! (validate-salary avg-salary))
    (try! (validate-salary median-salary))
    (try! (validate-confidence confidence))
    (let ((existing (map-get? degree-salary { degree: degree, location: location })))
      (map-set degree-salary { degree: degree, location: location }
        (merge (default-to
                 { avg-salary: u0, median-salary: u0, confidence: u0, last-updated: u0, data-points: u0 }
                 existing)
          {
            avg-salary: avg-salary,
            median-salary: median-salary,
            confidence: confidence,
            last-updated: block-height,
            data-points: (if (is-some existing) (+ (get data-points (unwrap! existing (err u0))) u1) u1)
          }
        )
      )
    )
    (ok true)
  )
)
(define-public (create-projection
  (student principal)
  (degree (string-utf8 50))
  (location (string-utf8 50))
  (years-experience uint)
  (currency (string-ascii 10))
)
  (let ((id (var-get next-projection-id))
          (salary-data (unwrap! (map-get? degree-salary { degree: degree, location: location }) (err ERR-PROJECTION-NOT-FOUND))))
    (asserts! (< id (var-get max-projections)) (err ERR-MAX-PROJECTIONS))
    (asserts! (validate-degree degree) (err ERR-INVALID-DEGREE))
    (asserts! (validate-location location) (err ERR-INVALID-LOCATION))
    (asserts! (validate-years years-experience) (err ERR-INVALID-YEARS))
    (asserts! (validate-currency currency) (err ERR-INVALID-CURRENCY))
    (let ((base-salary (if (> years-experience u0)
                           (+ (get avg-salary salary-data) (* years-experience u5000))
                           (get avg-salary salary-data)))
          (projected (/ (* base-salary (get confidence salary-data)) u100)))
      (map-set projections id
        {
          student: student,
          degree: degree,
          location: location,
          years-experience: years-experience,
          projected-salary: projected,
          confidence-score: (get confidence salary-data),
          created-at: block-height,
          updated-at: block-height,
          currency: currency
        }
      )
      (var-set next-projection-id (+ id u1))
      (ok id)
    )
  )
)
(define-public (update-projection
  (id uint)
  (new-degree (string-utf8 50))
  (new-location (string-utf8 50))
  (new-years uint)
)
  (let ((proj (unwrap! (map-get? projections id) (err ERR-PROJECTION-NOT-FOUND)))
          (salary-data (unwrap! (map-get? degree-salary { degree: new-degree, location: new-location }) (err ERR-PROJECTION-NOT-FOUND))))
    (asserts! (is-eq tx-sender (get student proj)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-degree new-degree))
    (try! (validate-location new-location))
    (try! (validate-years new-years))
    (try! (stx-transfer? (var-get update-fee) tx-sender (var-get oracle-principal)))
    (let ((base (+ (get avg-salary salary-data) (* new-years u5000)))
          (projected (/ (* base (get confidence salary-data)) u100)))
      (map-set projections id
        (merge proj
          {
            degree: new-degree,
            location: new-location,
            years-experience: new-years,
            projected-salary: projected,
            confidence-score: (get confidence salary-data),
            updated-at: block-height
          }
        )
      )
      (ok true)
    )
  )
)