# Image-to-MFM
- Q.なにこれ？ A.画像をMFMに変換するPythonプログラムです

# 使い方
1. Pythonの実行環境を用意する
   - 事前に Pillow をインストールしておくこと
1. option.txtの設定
  - filename
    - 読み込む画像のファイル名を指定
  - note_or_page
    - ノートかページかを指定
    - ノートの場合は 0、ページの場合は 1
  - resize_width
    - リサイズ後の横幅(px)を指定
    - 無効な値(0)を指定すると resize_height の値を基準にアスペクト比を維持してリサイズされる
  - resize_height
    - リサイズ後の縦幅(px)を指定
    - 無効な値(0)を指定すると resize_width の値を基準にアスペクト比を維持してリサイズされる
  - color_division
    - 色を割り算で減色するための値
    - 1.0以上の小数値を指定。推奨値は 32.0 ～ 64.0
  - color_type
    - 出力するMFMの色の種類を指定
    - 0: 6桁RGB
    - 1: 4桁RGBA
1. ImageToMFM.py を実行
  - 画像と同じ場所に画像と同じ名前の.txtファイルが生成される
  - その.txtファイルの中にMFMが書き込まれてる
