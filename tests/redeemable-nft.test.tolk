import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/errors"
import "@contracts/nft-messages"
import "@contracts/nft-storage"
import "@wrappers/RedeemableNftItem.gen"
import "@wrappers/nft-utils"

fun defaultNftStorage(owner: address, collection: address, index: uint64 = 1): NftItemStorage {
    return {
        initialized: true,
        index,
        collectionAddress: collection,
        ownerAddress: owner,
        content: beginCell().endCell(),
        redeemed: false,
    };
}

fun deployNftItem(deployer: Treasury, owner: Treasury, index: uint64 = 1): RedeemableNftItem {
    val item = RedeemableNftItem.fromStorage(defaultNftStorage(owner.address, deployer.address, index));
    val deployResult = item.sendDeploy(deployer.address, { value: ton("0.05") });
    expect(deployResult).toHaveSuccessfulDeploy({ to: item.address });
    return item;
}

get fun `test nft: owner can redeem once`() {
    val deployer = testing.treasury("deployer");
    val owner = testing.treasury("owner");
    val item = deployNftItem(deployer, owner);

    val before = item.getRedeemData();
    expect(before.redeemed).toEqual(false);
    expect(before.ownerAddress).toEqual(owner.address);

    val redeemResult = item.sendRedeemNft(owner.address, 0, { value: ton("0.05"), bounce: true });
    expect(redeemResult).toHaveSuccessfulTx<RedeemNft>({
        from: owner.address,
        to: item.address,
    });

    expect(item.getRedeemData().redeemed).toEqual(true);
}

get fun `test nft: non-owner cannot redeem`() {
    val deployer = testing.treasury("deployer");
    val owner = testing.treasury("owner");
    val stranger = testing.treasury("stranger");
    val item = deployNftItem(deployer, owner, 2);

    val redeemResult = item.sendRedeemNft(stranger.address, 0, { value: ton("0.05"), bounce: true });
    expect(redeemResult).toHaveFailedTx<RedeemNft>({
        from: stranger.address,
        to: item.address,
        exitCode: Errors.NotOwner,
    });

    expect(item.getRedeemData().redeemed).toEqual(false);
}
