
# Product design

> 今週の漫画と来週の一話を、検証可能な読者の熱でつなぐ。
この文書はOshikatsuのプロダクト判断に関する正本である

# Part I: Product Design

## P0. North Star: Human Groove Window

> 新しくリリースされた漫画を、短い時間に、人間同士で一緒に楽しむ。

これがOshikatsuの目的である。

いま読んだ人間が同じ限られた時間に驚き、笑い、迷い、推しを変え、その空気を共有する場所を作る。第一目的は、**今日出た漫画を、今日そこにいる人間たちで楽しく読むこと**である。Oshikatsuは「人間が参加している共有時間」を守る。

- みんなで「推し」を共有し合う
    ```text
    毎週特定の曜日の特定時刻に漫画の最新話がリリース
    -> 複数漫画の最新話が同時にリリースされる
    -> 対応するRoomがOshikatsuでオープン
    -> 読者達がRoomに集って「推す（＝お互いに感想を述べ合う）」
    -> emotion, letters, resonance, and changing votes form a live Groove
    -> SEAL closes this one-time shared moment
    -> the Room remains as a replayable memory
    ```

# Part II: Human-Verified Ballot Protocol

## V0. Strategy

人間証明から投票成立までは、次の一本の経路に固定する。

```text
Hedera Wallet接続
  -> rankingとballot hashを確定
  -> Room・ballot・Walletに束縛したsignalでWorld ID v4 proofを取得
  -> World Chainの確定済みhistorical stateで投稿前検証
  -> Wallet本人が初回ballotをHCSへ直接投稿
  -> Mirror Nodeから再構成
  -> 同じhistorical stateで公開再検証
  -> 最初の有効なnullifierだけにRoom capabilityを付与
  -> 更新・取消は同じpayerによるHCS latest-write-wins
  -> SEALで締め切る
```

このprotocolは次の三原則を守る。

1. World proofは初回投票で一度だけ要求し、その後の操作権はRoom capabilityとして扱う。
2. World Chainは人間証明の正当性、HCSは投稿者・順序・締切の正本とする。Manga Groove backendはformal validityを署名しない。
3. historical stateを取得できない場合は`INVALID`ではなく`UNVERIFIABLE`とし、検証が完了するまで投票成立を確定しない。

初回投票の状態遷移は次のとおりとする。

```text
DRAFT
  -> PROOF_ACQUIRED
  -> PREFLIGHT_VALID
  -> SUBMITTED
  -> REASSEMBLED
  -> VALID | INVALID | UNVERIFIABLE
  -> CAPABILITY_GRANTED | NULLIFIER_CONFLICT
```

`VALID`はWorld proofが有効であること、`CAPABILITY_GRANTED`はさらに同一Room内でnullifierの先行有効投票がないことを表す。UI上の「投票済み」は`SUBMITTED`ではなく`CAPABILITY_GRANTED`になった時点で表示する。


人間証明から投票成立までの作戦の中心方針は以下
    ```
    Wallet・ranking・Roomを束縛したsignalでWorld ID v4 proofを取得
    allow_legacy_proofs=falseでv4だけを受理
    World Chainのfinalized blockを複数archive RPCで検証
    HashPackからユーザーpayerでHCSへ直接投稿
    Mirror Nodeでchunkを厳密に再構成
    最初の有効nullifierへRoom capabilityを付与
    更新・取消は同じpayerによるcompletion sequence基準のLWW
    authority認証済みSEALで確定
    ```

