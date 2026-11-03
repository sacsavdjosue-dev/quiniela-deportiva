// CONCILIACION_PAGOS_GANADORES_V2
// Solo utilitario administrativo. NO representa elegibilidad legal ni reglas de premios.
const safeNonnegativeCents = value => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};

export function reconcileRankingPayments(ranking, paymentRows) {
  if (!ranking || !Array.isArray(ranking.rankings) || !Array.isArray(ranking.leaders) ||
      !Array.isArray(paymentRows)) throw Error('Datos de conciliacion invalidos');
  const byFolio = new Map(paymentRows.map(item => [String(item.folio), item]));
  const entries = ranking.rankings.map(item => {
    const p = byFolio.get(String(item.folio)) || {};
    const requiredCents = safeNonnegativeCents(p.required_cents);
    const validatedCents = safeNonnegativeCents(p.validated_cents);
    const reviewingCents = safeNonnegativeCents(p.reviewing_cents);
    const outstandingCents = Math.max(0,requiredCents-validatedCents);
    return {
      folio:item.folio,participant:item.participant,rank:item.rank,bestScore:item.bestScore,
      requiredCents,validatedCents,reviewingCents,outstandingCents,
      fullPaymentValidated:requiredCents > 0 && validatedCents >= requiredCents
    };
  });
  const leaders = new Set(ranking.leaders.map(x => String(x.folio)));
  const candidates = entries.filter(item => leaders.has(String(item.folio)));
  const confirmedCandidates = candidates.filter(item => item.fullPaymentValidated).length;
  return {
    summary:{totalCandidates:candidates.length,confirmedCandidates,
      candidatesForReview:candidates.length-confirmedCandidates},
    candidates,entries
  };
}
