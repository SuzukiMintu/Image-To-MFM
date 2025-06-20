# Image-to-MFM
- Q.なにこれ？ A.画像をMFMに変換するPythonプログラムです

# 使い方
1. Pythonの実行環境を用意する
  - Python 3.12 での動作を確認(他のバージョンでは未確認。古すぎなければ多分動くはず)
  - 事前に Pillow、numpy、scikit-learn をインストールしておく
    - pip install Pillow numpy scikit-learn
1. option.txtの設定
  - filename
    - 読み込む画像のファイル名を指定
    - 絶対パス または 相対パス。拡張子も含む
  - use_scale_index
    - 使用するスケールの種類の設定
    - 下記にて設定する scale の種類のうち、どれを使用するかを指定する
  - use_space_index
    - 使用するスペースの種類の設定
    - 下記にて設定する space の種類のうち、どれを使用するかを指定する
  - resize_width
    - リサイズ後の横幅(px)を指定
    - 無効な値(0)を指定すると resize_height の値を基準にアスペクト比を維持してリサイズされる
  - resize_height
    - リサイズ後の縦幅(px)を指定
    - 無効な値(0)を指定すると resize_width の値を基準にアスペクト比を維持してリサイズされる
  - smooth_repeat
    - リサイズ後の画像の色を滑らかにするための繰り返し回数
    - 指定した回数だけ画像を滑らかにする
    - 推奨値は 0 ～ 2
  - color_division
    - 色を割り算で減色するための値
    - 1.0 以上の小数値を指定。推奨値は 32.0 ～ 64.0
  - max_row_colors
    - 1行あたりの最大色数を指定
    - k-means法で色を分割する際の最大色数
    - 推奨値は 4
    - smooth_repeat、color_division との相性が悪いので、ここを設定する場合は smooth_repeat を 0、color_division を 1.0 にすることを推奨
  - color_type
    - 出力するMFMの色の種類を指定
    - 0: 6桁RGB
    - 1: 4桁RGBA
  - background_color
    - 背景色の設定
    - R, G, B, A の値を 0 ～ 255 の範囲で指定
    - color_type が 4桁RGBA の場合、アルファ値は 255 に自動で固定される
  - scale_preset
    - 使用するスケールの種類。$[scale.y= の値
    - カンマ区切りで指定 (例: 0.7, 0.185, 0.36)
  - space_preset
    - 使用するスペースの種類
    - 必ず "" で囲むこと
    - カンマ区切りで指定 (例: "　", " ")
  - max_overlap_bg_color
    - $[bg.color= をどれだけ重ねがけできるかの設定
    - MFMの仕様上、20個までしか重ねがけできないのでそれ用の設定
    - デフォルトだと $[scale.y= が含まれるので19個
    - 後から $[blur ] とか付け足したい場合はその分減らす必要がある
  - use_mfm
    - 使用するMFMの設定
    - bg 想定のプログラムだが、fg でやりたいといった場合にここを設定
    - bg または fg を指定。これ以外を指定すると勝手に bg が設定される
1. ImageToMFM.py を実行
  - 画像と同じ場所に画像と同じ名前の.txtファイルが生成される
  - その.txtファイルの中にMFMが書き込まれてる

# Tips
- リサイズの値を両方とも0にすると、元の画像のアスペクト比を保持して生成
- スペースは全角スペースが一番安定。半角スペースの場合恐らく機種ごとに大きさが違う
- ただノート用で生成しないのであれば半角スペースを使うのが一番良い
- MFMの見え方を確認したい場合は Misskey Hub のMFMお試しコーナーを使うと良い (https://misskey-hub.net/ja/tools/mfm-playground/)