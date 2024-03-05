require('dotenv').config();
import { JSONFile, Low } from '@commonify/lowdb';

import { LightSmartContractAccount, getDefaultLightAccountFactoryAddress } from '@alchemy/aa-accounts';
import { AlchemyProvider } from '@alchemy/aa-alchemy';
import { LocalAccountSigner, type Hex } from '@alchemy/aa-core';

import { Address, parseEther, type PrivateKeyAccount, encodeFunctionData } from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import nftContractAbi from './abis/NFTContract.json';

const chain = sepolia;

const initProvider = async (
  privKeyHex: Hex,
): Promise<{ provider: AlchemyProvider; owner: LocalAccountSigner<PrivateKeyAccount> }> => {
  const eoaSigner = LocalAccountSigner.privateKeyToAccountSigner(privKeyHex);
  // Create a provider to send user operations from your smart account
  const provider = new AlchemyProvider({
    // get your Alchemy API key at https://dashboard.alchemy.com
    apiKey: process.env.ALCHEMY_API_KEY!,
    chain,
  }).connect(
    (rpcClient) =>
      new LightSmartContractAccount({
        rpcClient,
        owner: eoaSigner,
        chain,
        factoryAddress: getDefaultLightAccountFactoryAddress(chain),
      }),
  );

  // Default you have to fund your smart account to pay for the gas of the user operations
  // If you have a policyId, you can use it to sponsor the gas of the user operations
  const policyId = process.env.SEPOLIA_PAYMASTER_POLICY_ID;
  if (policyId) {
    provider.withAlchemyGasManager({ policyId: policyId });
  }

  return { provider, owner: eoaSigner };
};

const initUser = async () => {
  const cache = new Low<{ scwAddress: Hex; address: Hex; pk: Hex }>(new JSONFile(`${process.cwd()}/.cache.json`));
  await cache.read();

  // If the cache is empty, we will create a new smart account and store the address in the cache
  const user = cache.data;
  if (!user) {
    // The private key of your EOA that will be the owner of Light Account
    // https://viem.sh/docs/accounts/privateKey.html
    const privKeyHex = generatePrivateKey() as Hex;
    const { provider, owner } = await initProvider(privKeyHex);
    const user = { scwAddress: await provider.getAddress(), address: await owner.getAddress(), pk: privKeyHex };
    cache.data = user;
    await cache.write();
    return { provider, owner, user };
  } else {
    const { provider, owner } = await initProvider(user.pk);
    return { provider, owner, user };
  }
};

const sendUserOp = async (provider, bundle) => {
  // If gas sponsorship ineligible, bypass paymaster middleware by passing in the paymasterAndData override
  const isEligible = await provider.checkGasSponsorshipEligibility(bundle);
  console.log(`User Operation is ${isEligible ? 'eligible' : 'ineligible'} for gas sponsorship`);

  // Send a user operation from your smart account
  const { hash: uoHash } = await provider.sendUserOperation(
    bundle,
    isEligible ? undefined : { paymasterAndData: '0x' },
  );

  console.log('UserOperation Hash: ', uoHash); // Log the user operation hash

  // Wait for the user operation to be mined
  const txHash = await provider.waitForUserOperationTransaction(uoHash);

  console.log('Transaction Hash: ', txHash); // Log the transaction hash
};

// https://accountkit.alchemy.com/overview/getting-started.html#_4-fund-your-smart-account
const aaSendETH = async (provider, to: Address, value: bigint) => {
  console.log('Smart Account: sending ETH');
  try {
    const bundle = {
      target: to, // The desired target contract address
      data: '0x', // The desired call data
      value: value, // (Optional) value to send the target contract address
    };

    await sendUserOp(provider, bundle);
  } catch (e) {
    console.error('aaSendETH:', e.message);
  }
};

// https://accountkit.alchemy.com/overview/getting-started.html#_4-fund-your-smart-account
const aaSendContract = async (provider, to: Address) => {
  console.log('Smart Account: send a Smart Contract transaction');
  try {
    // @ts-ignore
    const data = encodeFunctionData({
      abi: nftContractAbi,
      functionName: 'mint',
      args: [to],
    });
    const NFT_CONTRACT_ADDRESS = process.env.SEPOLIA_NFT_ADDRESS as `0x${string}`;
    const bundle = { target: NFT_CONTRACT_ADDRESS, data: data, value: 0n };

    await sendUserOp(provider, bundle);
  } catch (e) {
    console.error('aaSendContract:', e.message);
  }
};

const processScript = async () => {
  const { provider, user } = await initUser();
  console.log({ user });

  /**
   * Demo:
   * Smart Account: sending ETH
   * User Operation is eligible for gas sponsorship
   * UserOperation Hash:  0xded997feca2963c828fdf79875c34ef68efa0521dc353c53ebe59d46eba6d38c
   * Transaction Hash:  0x40e7f6da00203e2e9daa075fb9e3011ef7394dda78e79eeac8c01297bead2df4
   */
  // await aaSendETH(provider, user.scwAddress, parseEther('0.0001'));

  /**
   * Demo:
   * Smart Account: send a Smart Contract transaction
   * User Operation is eligible for gas sponsorship
   * UserOperation Hash:  0xdde52fd8f1a9a881e6d0a03b36e11378b2c76b4a87a0ddea8f1ff8bbc8db1834
   * Transaction Hash:  0xe98360e216f0eae3bb10b50878638948de76bf12fb5a3e7a6fa1e2c37a0b6293
   */
  await aaSendContract(provider, user.scwAddress);
};

processScript()
  .then(() => {
    console.log('DONE');
    process.exit(0);
  })
  .catch((error) => console.error(error));
