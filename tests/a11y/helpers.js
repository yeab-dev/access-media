// Shared steps for the player's Settings panel.
export async function openSettings(player) {
  const btn = player.getByRole('button', { name: /^(Settings|ቅንብሮች)$/ });
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
}
export async function chooseCaptions(player, option) {
  await openSettings(player);
  await player.getByLabel(/^(Caption language|የጽሑፍ ትርጉም ቋንቋ)$/).selectOption(option);
}
export async function chooseDescriptions(player, option) {
  await openSettings(player);
  await player.getByLabel(/^(Description language|የመግለጫ ቋንቋ)$/).selectOption(option);
}
