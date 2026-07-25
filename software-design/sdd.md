
# Product design

この文書はOshikatsuのプロダクト判断に関する正本である

# Part I: Product Design

## 利用者からみた「Oshikatsu」

> 新しくリリースされた漫画を一緒に集まってみんなで推しつつ、推しの近い仲間を見つけ、仲間経由で面白い漫画を見つけてもっと漫画を読み、さらに沢山の漫画を推して盛り上がる。その盛り上がりを見た別の仲間がもっと推しの漫画を見つけもっともっと盛り上がる

これがOshikatsuの目的である。

いま読んだ人間が同じ限られた時間に驚き、笑い、迷い、泣う、その空気を共有する場所を作る。第一目的は、**今日出た漫画を、今日そこにいる人間たちで楽しく読むこと**である。Oshikatsuは「人間が参加している共有時間」を守る。

みんなで同じ時間を共有し「推し」を共有し合う
```text
毎週特定の曜日の特定時刻に漫画の最新話がリリース
-> 複数漫画の最新話が同時にリリースされる
-> 対応するRoomがOshikatsuでオープン。Roomには複数漫画が入っている
-> 読者達がRoomに集って「推す（＝お互いに感想を述べ合う）」。推す方法は　スタンプ（絵文字のこと。「🔥神回」「😭泣いた」「🥺尊い」「🐉続き召喚」「👑優勝」「💡無事死亡」「🤗溶けた」「🐻‍❄️情緒崩壊」「🌋情緒噴火」など）、叫び（「作者様ありがとうございます!!来週まで生きられない」「神回すぎる!!!!!」「情緒が爆散した」など）。自分の推しや他人の推しやリアルタイムにRoomに反映され、熱狂を作り出す。同じ時間を共有するために、Roomは数時間経過したら封鎖される
-> さらに、みんなの推しは次の熱狂を作り出すために使われる
    ・Roomに自分の推したい漫画がなければだれでも一つは追加することができる
    ・漫画リリース後一定時間経つとRoomはSEALされ、その時点で推し数が多い漫画がランキング発表
    ・RoomがSEALされたタイミングで特定の漫画を推した人には実績が付与
        🥇１位達成：Room内で一位になった漫画の特定話を推していた人に付与される
        💎原石発掘：Room内で一位になった漫画をその回で初回に推していた人に付与される
        🔥継続応援：Roomに連続して参加した回数に応じて付与される
        ✏️投票回数：Roomに参加すると付与される
    ・特別なRoomが年に数回開かれる。これは漫画ではなくOshikatsuに参加している人に対する「推し」。このRoomでみんな人に対して推し合う
        🏆ファイナリスト：漫画文化に貢献した人
-> 相互のプロフィールを閲覧し、実績がたくさんある人がRoomで推している漫画を見ることで新しい「推し」を発掘。さらにその漫画を読むことでもっとOshikatsuが捗る
```

良い漫画を布教したい、という誰かの推しが、良い漫画を読みたいと考える人に届く仕組み。
Web2のコメントは複数投稿可能であったり、投稿がノーコストであるために場が荒れやすくまた、そもそも主催者によって結果が操作され出版社が売りたい漫画がランキング上位になるなどの特徴があったり、投票期間を恣意的にひろげたり縮めたり可能だがこれができないために良質な本物のコメントが集まりやすい場になるはずである。

なお、Roomはだれでも開設できる＆Hackathonのデモ運営上Room開設用のUIから開設可能。

## Hackの観点からみた「Oshikatsu」

> Cryptoを活用したSybil Resistanceな仮名投票システム。WorldID＋HCSの組み合わせによって、投票Windowの間の時刻のみ投票可能＋特定の人物が最後に実施した投票が有効票として扱われる＋一人一票が保証される＋人間であることは保証されているが投票そのものは仮名である（Walletのアドレスは現実世界のIdentityではない）＋集計が第三者でVerifiableで投票の主催者によって結果が操作されていない保証がある＋投票そのものに微量のコストがかかるためランダム投票など意味のない票を排除できる＋公開の場所で誰でも投票を開催できだれでも立候補できる　などの民主主義に必須の公正な投票をオンラインで行うための基盤が実現

人間証明から投票成立までは、次の一本の経路に固定する。

```
Hedera Wallet（HashPack）を接続
  -> Room内で投票する漫画のrankを選択したりコメントしたりしてから、確定ボタンを押す
  -> Room・コメントhash・Hedera Walletを束縛したballot hashとWorld signalを生成
  -> そのRoomへの初回投票時に限り、World ID v4による人間証明を取得
  -> World Chainの確定済みhistorical stateと公式WorldIDVerifierを使い、proofを投稿前に検証
  -> proofが有効な場合、Wallet本人がraw World proofを含む初回ballotをHCSへ直接投稿
  -> Mirror NodeからHCS messageを取得し、分割されたmessageを完全に再構成
  -> 投票時に固定したWorld Chainの同じhistorical stateを使い、第三者もWorld proofを再検証
  -> 同じRoom・同じWorld nullifierについて、HCS上で最初に成立した初回ballotだけにRoom capabilityを付与
  -> capability取得後はWorld IDを再度要求せず、同じHedera Walletから投票の更新・取消をHCSへ投稿
  -> 同じcapabilityについて、SEAL前に完了したHCS eventのうち最後のものを正式な投票状態として採用
  -> authority認証済みSEALのconsensus timestampでRoomの投票Windowを締め切り、結果を確定
```
World IDによる人間証明は、各Roomへの初回投票時に一度だけ要求する。

Roomは裏側ではそれぞれ独立した投票イベントである。そのためWorld IDは、Oshikatsu全体で恒久的なユーザーIDを作るためではなく、各Roomにおいて一人の人間が投票資格を一つだけ取得するために使用する。

Room A
  -> 初回投票時にWorld IDを一度実施
  -> Room Aのcapabilityを取得
  -> 締切までは同じWalletで何度でも更新・取消可能

Room B
  -> 初回投票時にWorld IDをもう一度実施
  -> Room Bのcapabilityを取得
  -> 締切までは同じWalletで何度でも更新・取消可能

同じRoom内でrankingを変更するたびにWorld IDを要求することはない。World proofは初回のRoom capability取得にのみ使用し、その後の操作権はHedera Walletに固定されたRoom capabilityとして扱う。

このprotocolは次の三原則を守る。

1. World IDは、Roomごとの一人一資格を成立させるために使う。
    各Roomへの初回投票時に一度だけWorld proofを要求する。有効なproofを持つ最初の初回ballotにRoom capabilityを付与し、その後の投票更新・取消にはWorld proofを再要求しない。
2. World ChainとHederaの責務を分離する。
    World Chain上の公式WorldIDVerifierは、人間証明とnullifierの正当性を担保する。Hedera Walletは投票者本人の意思を示し、HCSは投稿者、投稿順序、投票更新、取消、締切前後の正本となる。Oshikatsu backendは人間証明のformal validityを署名しない。
3. 無効なproofと、検証できないproofを区別する。
    WorldIDVerifierがproofを拒否した場合はINVALIDとする。一方、historical stateを取得できない、archive RPC間でblock hashが一致しないなど、検証を完了できない場合はUNVERIFIABLEとする。UNVERIFIABLEな初回ballotにはRoom capabilityを付与しない。

初回投票の状態遷移は次のとおりとする。
```
DRAFT
  Room内のrankingを編集中

  -> PROOF_ACQUIRED
     Room・ranking・締切・Walletに束縛されたWorld proofを取得済み

  -> PREFLIGHT_VALID
     World Chainの確定済みhistorical stateでproofを投稿前検証済み

  -> SUBMITTED
     Wallet本人が初回ballotをHCSへ送信済み

  -> REASSEMBLED
     Mirror NodeからHCS messageを完全に再構成済み

  -> VALID
     World proof、ballot hash、signal、Hedera payer、締切条件がすべて有効

  -> INVALID
     proof、hash、payer、締切などの検証に失敗

  -> UNVERIFIABLE
     historical stateなどを取得できず、第三者検証を完了できない

  -> CAPABILITY_GRANTED
     VALIDであり、同じRoom・同じnullifierの先行capabilityが存在しない

  -> NULLIFIER_CONFLICT
     VALIDではあるが、同じRoom・同じnullifierのcapabilityがすでに存在
```

VALIDは、初回ballotに含まれるWorld proofと投票情報が正しいことを表す。

CAPABILITY_GRANTEDは、さらにそのRoomにおける一人一資格の条件を満たし、当該Hedera Walletが投票を更新・取消できる状態になったことを表す。

UI上で「投票済み」と表示するのは、HCSへの送信が完了したSUBMITTED時点ではなく、公開検証とnullifier競合判定が完了したCAPABILITY_GRANTED時点とする。
