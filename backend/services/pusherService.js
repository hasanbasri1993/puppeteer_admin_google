import Pusher from './../config/pusher';

export async function performLogin(page, username, password) {
    const pusher = new Pusher({
        appId: "1929564",
        key: "59b1d4f6c53ef71de35b",
        secret: "46697fb7c225d4784713",
        cluster: "ap1",
        useTLS: true
    });

    pusher.trigger("my-channel", "my-event", {
        message: "hello world"
    });
}