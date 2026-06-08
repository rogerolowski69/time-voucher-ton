import "@acton/emulation/network"
import "@contracts/messages"
import "RedeemableNftItem.gen"

fun RedeemableNftItem.sendDeploy(self, from: address, params: SendParams): SendResultList {
    val outMessage = createMessage({
        bounce: false,
        value: params.value,
        dest: { stateInit: self.stateInit! },
        body: TopUpTons {},
    });
    return net.send(from, outMessage);
}
