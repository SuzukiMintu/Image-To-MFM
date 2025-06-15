from Functions import *

#=================================================
# 変数定義
#=================================================

# スケールの種類
# 0: ノート用   1: ページ用
scale_type = {
    0: "$[scale.y=0.7 ",
    1: "$[scale.y=0.185 "
}
# 空白として使う文字の種類
# 0: ノート用   1: ページ用
space_char_type = {
    0: "　",
    1: " "
}

#=================================================
# main処理
#=================================================

def main():
    # オプションファイルの読み込み
    option = LoadOptionFile("option.txt")
    if not option:
        print("Invalid option file.")
        return
    print("\n")

    # 画像の読み込み
    img = LoadPngFile(option["filename"])
    if img is None:
        print("Failed to load image.")
        return
    print("\n")
    
    # 画像のリサイズ値の計算
    option["resize_width"], option["resize_height"] = CalculateResizeValue(img.size, (option["resize_width"], option["resize_height"]))
    if option["resize_width"] is None or option["resize_height"] is None:
        print("Invalid resize dimensions.")
        return
    print("\n")

    # 画像のリサイズ
    img = ResizePngFile(img, [option["resize_width"], option["resize_height"]])
    if img is None:
        print("Failed to resize image.")
        return
    print("\n")

    # 画像から色を抽出
    color_array = ConvertPngToArray(img)
    if color_array is None:
        print("Failed to convert image to color array.")
        return
    print("\n")

    # ピクセルの色を割り算
    color_array = DivideColor(color_array, option["color_division"])
    if color_array is None:
        print("Failed to reduce colors.")
        return
    print("\n")
    
    # MFMアートの生成
    mfm_text = GenerateMFM(
        color_array,
        option["color_type"],
        scale_type[option["note_or_page"]],
        space_char_type[option["note_or_page"]]
    )
    if mfm_text is None:
        print("Failed to generate MFM text.")
        return
    print("\n")

    # MFMアートの保存
    output_filename = option["filename"].split("/")[-1]
    output_filename = output_filename.split(".")[0]
    is_output_complate = OutputMFMArt(mfm_text, output_filename)
    if not is_output_complate:
        print("Failed to save MFM art.")
        return
    print("\n")

    # 完了メッセージの表示
    print(f"MFM art saved success.")
    # 出力したMFMの文字数を表示
    print(f"Output MFM character count: {len(mfm_text)}\n")

main()