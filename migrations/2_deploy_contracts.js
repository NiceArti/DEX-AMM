const Factory = artifacts.require("Factory");
const Token = artifacts.require("Token");
const Pair = artifacts.require("Pair");

module.exports = function (deployer) {
  deployer.deploy(Factory);

  deployer.deploy(Token, "first token", "for-migration");

  const address1 = '0x1000000000000000000000000000000000000000';
  const address2 = '0x2000000000000000000000000000000000000000';
  const address3 = '0x0000000000000000000000000000000000000000';
  deployer.deploy(Pair, address1, address2, 'deploy', 'pair', address3);
}