import prisma from '../db.js';

export async function applyMonthlyInterest(): Promise<void> {
  console.log(`Monthly interest job started at ${new Date().toISOString()}`);

  const savingAccounts = await prisma.bankAccount.findMany({
    where: {
      type: 'saving',
      interestRate: { not: null, gt: 0 },
    },
  });

  console.log(`Found ${savingAccounts.length} saving accounts to process`);

  for (const account of savingAccounts) {
    try {
      const interestRate = Number(account.interestRate!);
      const interestAmount = Number(account.balance) * (interestRate / 100 / 12);
      const roundedInterest = Math.round(interestAmount * 10000) / 10000;

      const previousBalance = Number(account.balance);
      const newBalance = previousBalance + roundedInterest;

      await prisma.$transaction([
        prisma.bankAccount.update({
          where: { id: account.id },
          data: {
            balance: newBalance,
          },
        }),
        prisma.interestLog.create({
          data: {
            accountId: account.id,
            previousBalance,
            interestAmount: roundedInterest,
            newBalance,
            interestRate,
          },
        }),
      ]);

      console.log(
        `Applied interest ${roundedInterest} to account ${account.id} (was ${previousBalance}, now ${newBalance})`
      );
    } catch (err) {
      console.error(`Failed to apply interest to account ${account.id}:`, err);
    }
  }

  console.log(`Monthly interest job completed — ${savingAccounts.length} accounts updated`);
}
