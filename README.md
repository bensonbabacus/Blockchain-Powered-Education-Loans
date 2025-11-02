# 📚 Blockchain-Powered Education Loans

Welcome to a revolutionary Web3 platform that makes higher education accessible by providing decentralized loans collateralized by students' projected future earnings. Built on the Stacks blockchain using Clarity smart contracts, this project addresses the real-world problem of skyrocketing education costs and predatory lending practices. Instead of traditional collateral like assets or credit scores, loans are secured against on-chain projections of earning potential based on degree programs, market data, and personal achievements—empowering students from all backgrounds to invest in their future without lifelong debt traps.

## ✨ Features
🔑 Decentralized loan issuance based on verifiable earning projections  
💰 Collateralized by future income streams, not physical assets  
📈 On-chain oracles for real-time earning data from job markets and alumni outcomes  
📊 Transparent repayment schedules tied to actual post-graduation earnings  
🤝 Lender pools for community-funded education investments  
⚖️ Automated dispute resolution and insurance mechanisms  
📉 Risk mitigation through diversified projections and governance updates  
🔒 Immutable records of student profiles, loan terms, and repayments  

## 🛠 How It Works
This platform leverages 8 interconnected Clarity smart contracts to create a secure, transparent ecosystem for education financing. Here's a breakdown:

### Smart Contracts Overview
1. **StudentProfileContract**: Stores and verifies student data, including academic history, intended degree, and personal achievements. Ensures privacy and immutability.
2. **EarningOracleContract**: Integrates with external data sources (via Stacks oracles) to fetch and project future earnings based on field of study, location, and market trends.
3. **CollateralEvaluatorContract**: Calculates loan eligibility and collateral value by analyzing oracle data against student profiles to generate a "future earnings score."
4. **LoanFactoryContract**: Deploys new loan instances, defining terms like amount, interest rate, and repayment thresholds based on projected earnings.
5. **IndividualLoanContract**: Manages active loans, tracking disbursements, grace periods (e.g., during studies), and income-based repayments.
6. **LenderPoolContract**: Allows lenders to pool funds, vote on loan approvals, and earn yields proportional to risk.
7. **RepaymentTrackerContract**: Monitors post-graduation income (self-reported or via oracles) and automates repayments as a percentage of earnings above a minimum threshold.
8. **GovernanceContract**: Enables community governance for updating parameters like interest caps or oracle sources, ensuring the system evolves with market changes.

**For Students (Borrowers)**  
- Create a profile in StudentProfileContract with your academic details and hash of supporting documents.  
- Request a projection from EarningOracleContract and evaluate collateral via CollateralEvaluatorContract.  
- Apply for a loan through LoanFactoryContract, which deploys an IndividualLoanContract if approved by lenders.  
- Funds are disbursed; repayments kick in post-graduation via RepaymentTrackerContract, scaled to your actual earnings (e.g., 10% of income over $50K/year).  

**For Lenders**  
- Deposit funds into LenderPoolContract to participate in funding pools.  
- Review and vote on loan applications based on collateral evaluations.  
- Earn interest from repayments, with risks mitigated by diversified pools and governance.  

**For Verifiers/Administrators**  
- Use GovernanceContract to propose and vote on system updates.  
- Query any contract for transparent audits, like verifying a loan's status or a projection's accuracy.  

Boom! Education financing reimagined—fair, decentralized, and future-proof. No more crushing debt; just smart contracts enabling dreams.