port module Main exposing (main)

import Browser
import Html exposing (Html, button, div, fieldset, footer, h1, h2, h3, header, img, input, label, main_, option, p, section, select, span, strong, text)
import Html.Attributes exposing (attribute, class, disabled, for, id, placeholder, selected, src, style, type_, value)
import Html.Events exposing (onClick, onInput)
import Json.Decode as Decode exposing (Decoder)
import Json.Encode as Encode
import List
import Process
import String
import Svg exposing (circle, line, path, svg)
import Svg.Attributes as SvgAttr
import Task


port persist : Encode.Value -> Cmd msg


port setShare : Encode.Value -> Cmd msg


port clearShare : () -> Cmd msg


port requestSeed : () -> Cmd msg


port seedReceived : (Int -> msg) -> Sub msg


port copyLink : () -> Cmd msg


port linkCopied : (Bool -> msg) -> Sub msg


type Mechanic
    = Toss


type alias Choice =
    { label : String
    , imageUrl : String
    }


type alias Group =
    { name : String
    , background : String
    , foreground : String
    , pickCount : Int
    , options : List Choice
    }


type alias Picker =
    { id : Int
    , title : String
    , mechanic : Mechanic
    , groups : List Group
    }


type Screen
    = BuildScreen
    | RunScreen


type TossState
    = Waiting
    | Tossing
    | Revealed


type alias ValidationError =
    { key : String
    , message : String
    }


type alias Model =
    { picker : Picker
    , saved : List Picker
    , screen : Screen
    , seed : Maybe Int
    , tossState : TossState
    , errors : List ValidationError
    , notice : Maybe String
    , sharedError : Maybe String
    , year : Int
    }


type alias Flags =
    { saved : List Picker
    , shared : Maybe Picker
    , seed : Maybe Int
    , sharedError : Maybe String
    , year : Int
    }


type Msg
    = SetTitle String
    | SetGroupName Int String
    | SetGroupBackground Int String
    | SetGroupForeground Int String
    | ChangePickCount Int Int
    | SetChoiceLabel Int Int String
    | SetChoiceImage Int Int String
    | AddChoice Int
    | RemoveChoice Int Int
    | AddGroup
    | RemoveGroup Int
    | SaveCurrent
    | LoadSaved String
    | NewPicker
    | OpenRun
    | BackToBuild
    | TossNow
    | GotSeed Int
    | Reveal
    | CopyResult
    | Copied Bool


main : Program Decode.Value Model Msg
main =
    Browser.element
        { init = init
        , update = update
        , subscriptions = subscriptions
        , view = view
        }


init : Decode.Value -> ( Model, Cmd Msg )
init rawFlags =
    let
        flags =
            Decode.decodeValue flagsDecoder rawFlags
                |> Result.withDefault
                    { saved = []
                    , shared = Nothing
                    , seed = Nothing
                    , sharedError = Just "Saved data could not be opened. Starting fresh."
                    , year = 2026
                    }

        picker =
            case flags.shared of
                Just sharedPicker ->
                    sharedPicker

                Nothing ->
                    flags.saved
                        |> List.head
                        |> Maybe.withDefault defaultPicker

        openedFromLink =
            case flags.shared of
                Just _ ->
                    True

                Nothing ->
                    False
    in
    ( { picker = picker
      , saved = flags.saved
      , screen =
            if openedFromLink then
                RunScreen

            else
                BuildScreen
      , seed = flags.seed
      , tossState =
            case flags.seed of
                Just _ ->
                    Revealed

                Nothing ->
                    Waiting
      , errors = []
      , notice = Nothing
      , sharedError = flags.sharedError
      , year = flags.year
      }
    , Cmd.none
    )


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ seedReceived GotSeed
        , linkCopied Copied
        ]


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SetTitle title ->
            updatePicker (\picker -> { picker | title = title }) model

        SetGroupName groupIndex name ->
            updateGroup groupIndex (\group -> { group | name = name }) model

        SetGroupBackground groupIndex color ->
            updateGroup groupIndex (\group -> { group | background = color }) model

        SetGroupForeground groupIndex color ->
            updateGroup groupIndex (\group -> { group | foreground = color }) model

        ChangePickCount groupIndex delta ->
            updateGroup groupIndex
                (\group ->
                    let
                        maximum =
                            max 1 (List.length group.options)
                    in
                    { group | pickCount = clamp 1 maximum (group.pickCount + delta) }
                )
                model

        SetChoiceLabel groupIndex choiceIndex choiceLabel ->
            updateGroup groupIndex
                (\group ->
                    { group
                        | options =
                            updateAt choiceIndex
                                (\choice -> { choice | label = choiceLabel })
                                group.options
                    }
                )
                model

        SetChoiceImage groupIndex choiceIndex imageUrl ->
            updateGroup groupIndex
                (\group ->
                    { group
                        | options =
                            updateAt choiceIndex
                                (\choice -> { choice | imageUrl = imageUrl })
                                group.options
                    }
                )
                model

        AddChoice groupIndex ->
            updateGroup groupIndex
                (\group -> { group | options = group.options ++ [ { label = "", imageUrl = "" } ] })
                model

        RemoveChoice groupIndex choiceIndex ->
            updateGroup groupIndex
                (\group ->
                    let
                        remaining =
                            removeAt choiceIndex group.options
                    in
                    { group
                        | options = remaining
                        , pickCount = min group.pickCount (max 1 (List.length remaining))
                    }
                )
                model

        AddGroup ->
            let
                groupNumber =
                    List.length model.picker.groups + 1
            in
            updatePicker
                (\picker ->
                    { picker
                        | groups =
                            picker.groups
                                ++ [ { name = "List " ++ String.fromInt groupNumber
                                     , background = "#6c5ce7"
                                     , foreground = "#ffffff"
                                     , pickCount = 1
                                     , options =
                                        [ { label = "First item", imageUrl = "" }
                                        , { label = "Second item", imageUrl = "" }
                                        ]
                                     }
                                   ]
                    }
                )
                model

        RemoveGroup groupIndex ->
            updatePicker
                (\picker -> { picker | groups = removeAt groupIndex picker.groups })
                model

        SaveCurrent ->
            let
                saved =
                    upsertPicker model.picker model.saved
            in
            ( { model | saved = saved, notice = Just "Saved here.", errors = [] }
            , persist (Encode.list pickerEncoder saved)
            )

        LoadSaved rawId ->
            case String.toInt rawId |> Maybe.andThen (findPicker model.saved) of
                Just picker ->
                    ( { model
                        | picker = picker
                        , screen = BuildScreen
                        , seed = Nothing
                        , tossState = Waiting
                        , errors = []
                        , notice = Nothing
                      }
                    , clearShare ()
                    )

                Nothing ->
                    ( model, Cmd.none )

        NewPicker ->
            let
                nextId =
                    model.saved
                        |> List.map .id
                        |> List.maximum
                        |> Maybe.withDefault 0
                        |> (+) 1
            in
            ( { model
                | picker = blankPicker nextId
                , screen = BuildScreen
                , seed = Nothing
                , tossState = Waiting
                , errors = []
                , notice = Nothing
              }
            , clearShare ()
            )

        OpenRun ->
            let
                errors =
                    validate model.picker
            in
            if List.isEmpty errors then
                ( { model
                    | screen = RunScreen
                    , seed = Nothing
                    , tossState = Waiting
                    , errors = []
                    , notice = Nothing
                  }
                , setSharePayload model.picker Nothing
                )

            else
                ( { model | errors = errors, notice = Nothing }, Cmd.none )

        BackToBuild ->
            ( { model
                | screen = BuildScreen
                , seed = Nothing
                , tossState = Waiting
                , errors = []
                , notice = Nothing
              }
            , clearShare ()
            )

        TossNow ->
            ( { model | tossState = Tossing, notice = Nothing }
            , requestSeed ()
            )

        GotSeed seed ->
            ( { model | seed = Just seed, tossState = Tossing }
            , Cmd.batch
                [ setSharePayload model.picker (Just seed)
                , Process.sleep 700 |> Task.perform (always Reveal)
                ]
            )

        Reveal ->
            ( { model | tossState = Revealed }, Cmd.none )

        CopyResult ->
            ( { model | notice = Just "Copying…" }, copyLink () )

        Copied worked ->
            ( { model
                | notice =
                    Just
                        (if worked then
                            "Copied."

                         else
                            "Copy failed. Copy the URL from your browser."
                        )
              }
            , Cmd.none
            )


updatePicker : (Picker -> Picker) -> Model -> ( Model, Cmd Msg )
updatePicker transform model =
    ( { model | picker = transform model.picker, errors = [], notice = Nothing }, Cmd.none )


updateGroup : Int -> (Group -> Group) -> Model -> ( Model, Cmd Msg )
updateGroup groupIndex transform model =
    updatePicker
        (\picker -> { picker | groups = updateAt groupIndex transform picker.groups })
        model


view : Model -> Html Msg
view model =
    div [ class "app-shell" ]
        [ viewHeader model
        , case model.screen of
            BuildScreen ->
                viewBuilder model

            RunScreen ->
                viewRunner model
        , footer [ class "site-footer" ]
            [ svg
                [ SvgAttr.class "tower-mark"
                , SvgAttr.viewBox "0 0 64 96"
                , attribute "aria-hidden" "true"
                ]
                [ line [ SvgAttr.x1 "32", SvgAttr.y1 "3", SvgAttr.x2 "32", SvgAttr.y2 "19" ] []
                , circle [ SvgAttr.class "tower-mark__sphere", SvgAttr.cx "32", SvgAttr.cy "29", SvgAttr.r "10" ] []
                , path [ SvgAttr.d "M32 39 L25 84 M32 39 L39 84 M21 84 H43" ] []
                ]
            , span [ class "footer-copy" ]
                [ text ("tossed together @ berlin " ++ String.fromInt model.year) ]
            ]
        ]


viewHeader : Model -> Html Msg
viewHeader model =
    header [ class "topbar" ]
        [ button [ class "wordmark", onClick BackToBuild, attribute "aria-label" "Edit toss" ]
            [ span [ class "wordmark-dot" ] []
            , text "TOSS (LIKE A BOSS)"
            ]
        , div [ class "mode-indicator" ]
            [ span [ class "mode-number" ]
                [ text
                    (case model.screen of
                        BuildScreen ->
                            "01"

                        RunScreen ->
                            "02"
                    )
                ]
            , span []
                [ text
                    (case model.screen of
                        BuildScreen ->
                            "SET UP"

                        RunScreen ->
                            "PICK"
                    )
                ]
            ]
        ]


viewBuilder : Model -> Html Msg
viewBuilder model =
    main_ [ class "builder" ]
        [ section [ class "builder-intro" ]
            [ h1 [] [ text "What" ]
            , p [ class "lede" ]
                [ text "Add one or more lists. Choose how many items to pick from each." ]
            ]
        , viewLocalShelf model
        , case model.sharedError of
            Just sharedError ->
                div [ class "banner banner--warning", attribute "role" "status" ] [ text sharedError ]

            Nothing ->
                text ""
        , if List.isEmpty model.errors then
            text ""

          else
            div [ class "banner banner--error", attribute "role" "alert" ]
                [ span [ class "banner-title" ] [ text "Check these:" ]
                , div [] (model.errors |> uniqueMessages |> List.map (\message -> p [] [ text message ]))
                ]
        , section [ class "builder-grid" ]
            [ div [ class "editor-column" ]
                [ fieldset [ class "title-field" ]
                    [ label [ for "picker-title" ] [ text "Name" ]
                    , input
                        [ id "picker-title"
                        , value model.picker.title
                        , onInput SetTitle
                        , placeholder "Dinner"
                        , invalidAttribute (hasError "title" model.errors)
                        ]
                        []
                    ]
                , div [ class "groups" ]
                    (List.indexedMap (viewGroupEditor model.errors) model.picker.groups)
                , button [ class "button button--add", onClick AddGroup ] [ text "+ Add list" ]
                ]
            , viewLivePreview model.picker
            ]
        , div [ class "builder-actions" ]
            [ div [ class "total-pill", attribute "data-testid" "total-picks" ]
                [ text (pickLabel (totalPickCount model.picker)) ]
            , div [ class "action-cluster" ]
                [ button [ class "button button--secondary", onClick SaveCurrent ] [ text "Save here" ]
                , button [ class "button button--primary", onClick OpenRun ] [ text "Continue" ]
                ]
            ]
        , viewNotice model.notice
        ]


viewLocalShelf : Model -> Html Msg
viewLocalShelf model =
    div [ class "local-shelf" ]
        [ label [ for "saved-picker" ] [ text "SAVED HERE" ]
        , select [ id "saved-picker", onInput LoadSaved, attribute "aria-label" "Saved tosses" ]
            (option [ value "", selected (List.isEmpty model.saved), disabled True ] [ text "Open a saved toss" ]
                :: List.map
                    (\picker ->
                        option
                            [ value (String.fromInt picker.id)
                            , selected (picker.id == model.picker.id)
                            ]
                            [ text picker.title ]
                    )
                    model.saved
            )
        , button [ class "button button--quiet", onClick NewPicker ] [ text "+ New toss" ]
        ]


viewGroupEditor : List ValidationError -> Int -> Group -> Html Msg
viewGroupEditor errors groupIndex group =
    let
        safeName =
            if String.isEmpty (String.trim group.name) then
                "List " ++ String.fromInt (groupIndex + 1)

            else
                group.name

        groupKey =
            "group-" ++ String.fromInt groupIndex
    in
    section [ class "group-card" ]
        [ div [ class "group-card__accent", style "background" group.background ] []
        , div [ class "group-card__header" ]
            [ div [ class "group-index" ] [ text (String.padLeft 2 '0' (String.fromInt (groupIndex + 1))) ]
            , fieldset [ class "group-name-field" ]
                [ label [ for (groupKey ++ "-name") ] [ text "List name" ]
                , input
                    [ id (groupKey ++ "-name")
                    , value group.name
                    , onInput (SetGroupName groupIndex)
                    , invalidAttribute (hasError (groupKey ++ "-name") errors)
                    ]
                    []
                ]
            , button
                [ class "icon-button"
                , onClick (RemoveGroup groupIndex)
                , attribute "aria-label" ("Remove " ++ safeName ++ " list")
                ]
                [ text "×" ]
            ]
        , div [ class "group-controls" ]
            [ div [ class "pick-control" ]
                [ span [ class "control-label" ] [ text "TAKE" ]
                , button
                    [ class "stepper"
                    , onClick (ChangePickCount groupIndex -1)
                    , disabled (group.pickCount <= 1)
                    , attribute "aria-label" ("Decrease " ++ safeName ++ " picks")
                    ]
                    [ text "−" ]
                , strong [] [ text (String.fromInt group.pickCount) ]
                , button
                    [ class "stepper"
                    , onClick (ChangePickCount groupIndex 1)
                    , disabled (group.pickCount >= List.length group.options)
                    , attribute "aria-label" ("Increase " ++ safeName ++ " picks")
                    ]
                    [ text "+" ]
                , span [ class "of-count" ] [ text ("FROM " ++ String.fromInt (List.length group.options)) ]
                ]
            , div [ class "color-controls" ]
                [ label []
                    [ span [] [ text "CARD" ]
                    , input
                        [ type_ "color"
                        , value group.background
                        , onInput (SetGroupBackground groupIndex)
                        , attribute "aria-label" (safeName ++ " card color")
                        ]
                        []
                    ]
                , label []
                    [ span [] [ text "TEXT" ]
                    , input
                        [ type_ "color"
                        , value group.foreground
                        , onInput (SetGroupForeground groupIndex)
                        , attribute "aria-label" (safeName ++ " text")
                        ]
                        []
                    ]
                ]
            ]
        , div [ class "choice-list" ]
            (List.indexedMap (viewChoiceEditor errors groupIndex safeName) group.options)
        , button [ class "button button--choice", onClick (AddChoice groupIndex) ] [ text "+ Add item" ]
        ]


viewChoiceEditor : List ValidationError -> Int -> String -> Int -> Choice -> Html Msg
viewChoiceEditor errors groupIndex groupName choiceIndex choice =
    let
        fieldId =
            "group-" ++ String.fromInt groupIndex ++ "-choice-" ++ String.fromInt choiceIndex

        accessibleNumber =
            String.fromInt (choiceIndex + 1)
    in
    div [ class "choice-row" ]
        [ span [ class "choice-number" ] [ text accessibleNumber ]
        , div [ class "choice-fields" ]
            [ label [ class "sr-only", for (fieldId ++ "-label") ]
                [ text (groupName ++ " item " ++ accessibleNumber) ]
            , input
                [ id (fieldId ++ "-label")
                , value choice.label
                , onInput (SetChoiceLabel groupIndex choiceIndex)
                , placeholder "Item name"
                , invalidAttribute (hasError fieldId errors)
                ]
                []
            , label [ class "sr-only", for (fieldId ++ "-image") ]
                [ text (groupName ++ " item " ++ accessibleNumber ++ " image") ]
            , input
                [ id (fieldId ++ "-image")
                , class "image-url"
                , value choice.imageUrl
                , onInput (SetChoiceImage groupIndex choiceIndex)
                , placeholder "Image URL (optional)"
                , type_ "url"
                ]
                []
            ]
        , button
            [ class "icon-button icon-button--small"
            , onClick (RemoveChoice groupIndex choiceIndex)
            , attribute "aria-label" ("Remove " ++ groupName ++ " item " ++ accessibleNumber)
            ]
            [ text "×" ]
        ]


viewLivePreview : Picker -> Html Msg
viewLivePreview picker =
    section [ class "preview-column", attribute "aria-label" "Preview" ]
        [ div [ class "preview-sticky" ]
            [ div [ class "eyebrow" ] [ text "PREVIEW" ]
            , h2 [] [ text picker.title ]
            , div [ class "preview-stack" ]
                (List.indexedMap viewPreviewGroup picker.groups)
            , div [ class "preview-total" ]
                [ span [] [ text "TOTAL" ]
                , strong [] [ text (pickLabel (totalPickCount picker)) ]
                ]
            ]
        ]


viewPreviewGroup : Int -> Group -> Html Msg
viewPreviewGroup groupIndex group =
    div
        [ class "preview-group"
        , style "background" group.background
        , style "color" group.foreground
        , style "transform" ("rotate(" ++ String.fromInt (previewRotation groupIndex) ++ "deg)")
        ]
        [ div [ class "preview-group__top" ]
            [ strong [] [ text group.name ]
            , span [] [ text (String.fromInt group.pickCount ++ " / " ++ String.fromInt (List.length group.options)) ]
            ]
        , div [ class "preview-options" ]
            (group.options
                |> List.take 4
                |> List.map (\choice -> span [] [ text choice.label ])
            )
        ]


viewRunner : Model -> Html Msg
viewRunner model =
    main_ [ class "runner" ]
        [ section [ class "runner-heading" ]
            [ button [ class "back-button", onClick BackToBuild ] [ text "← Change" ]
            , div [ class "eyebrow" ] [ text "YOUR TOSS" ]
            , h1 [] [ text model.picker.title ]
            , p [] [ text (runSummary model.picker) ]
            ]
        , section
            [ class
                (if model.tossState == Tossing then
                    "run-surface run-surface--tossing"

                 else
                    "run-surface"
                )
            ]
            (List.indexedMap (viewRunGroup model) model.picker.groups)
        , div [ class "run-actions" ]
            [ button
                [ class "toss-button"
                , onClick TossNow
                , disabled (model.tossState == Tossing)
                ]
                [ span [ class "toss-button__verb" ]
                    [ text
                        (if model.tossState == Tossing then
                            "TOSSING"

                         else
                            "TOSS"
                        )
                    ]
                , span [] [ text (pickLabel (totalPickCount model.picker)) ]
                ]
            , button
                [ class "button button--secondary"
                , onClick CopyResult
                , disabled (model.seed == Nothing)
                ]
                [ text "Copy this result" ]
            ]
        , viewNotice model.notice
        ]


viewRunGroup : Model -> Int -> Group -> Html Msg
viewRunGroup model groupIndex group =
    let
        revealResults =
            case ( model.tossState, model.seed ) of
                ( Revealed, Just seed ) ->
                    selectedChoices seed groupIndex group

                _ ->
                    []

        testName =
            safeTestName group.name
    in
    section
        [ class "run-group"
        , style "background-color" group.background
        , style "color" group.foreground
        , attribute "data-testid" ("run-group-" ++ testName)
        ]
        [ div [ class "run-group__heading" ]
            [ div []
                [ span [ class "run-group__index" ] [ text (String.padLeft 2 '0' (String.fromInt (groupIndex + 1))) ]
                , h2 [] [ text group.name ]
                ]
            , span [ class "run-group__quota" ] [ text ("TAKE " ++ String.fromInt group.pickCount) ]
            ]
        , if model.tossState == Tossing then
            div [ class "throw-zone", attribute "aria-live" "polite" ]
                (List.range 1 group.pickCount
                    |> List.map
                        (\index ->
                            div
                                [ class "throw-card"
                                , style "--throw-index" (String.fromInt index)
                                ]
                                [ text "?" ]
                        )
                )

          else if List.isEmpty revealResults then
            div [ class "waiting-options" ]
                (group.options
                    |> List.map .label
                    |> List.map (\choiceLabel -> span [] [ text choiceLabel ])
                )

          else
            div
                [ class "result-grid"
                , attribute "data-testid" ("result-group-" ++ testName)
                , attribute "aria-live" "polite"
                ]
                (List.map viewResultCard revealResults)
        ]


viewResultCard : Choice -> Html Msg
viewResultCard choice =
    articleLike
        [ class "result-card", attribute "data-testid" "result-card" ]
        ([ if String.isEmpty (String.trim choice.imageUrl) then
            text ""

           else
            img [ src choice.imageUrl, attribute "alt" "", attribute "loading" "lazy" ] []
         , strong [] [ text choice.label ]
         ]
        )


articleLike : List (Html.Attribute msg) -> List (Html msg) -> Html msg
articleLike attributes children =
    Html.node "article" attributes children


viewNotice : Maybe String -> Html Msg
viewNotice notice =
    case notice of
        Just message ->
            div [ class "notice", attribute "role" "status" ] [ text message ]

        Nothing ->
            text ""


setSharePayload : Picker -> Maybe Int -> Cmd Msg
setSharePayload picker seed =
    setShare
        (Encode.object
            [ ( "picker", pickerEncoder picker )
            , ( "seed"
              , case seed of
                    Just value_ ->
                        Encode.int value_

                    Nothing ->
                        Encode.null
              )
            ]
        )


validate : Picker -> List ValidationError
validate picker =
    let
        titleErrors =
            if String.isEmpty (String.trim picker.title) then
                [ { key = "title", message = "Add a name." } ]

            else
                []

        groupErrors =
            if List.isEmpty picker.groups then
                [ { key = "groups", message = "Add a list." } ]

            else
                picker.groups
                    |> List.indexedMap validateGroup
                    |> List.concat
    in
    titleErrors ++ groupErrors


validateGroup : Int -> Group -> List ValidationError
validateGroup groupIndex group =
    let
        prefix =
            "group-" ++ String.fromInt groupIndex

        nameErrors =
            if String.isEmpty (String.trim group.name) then
                [ { key = prefix ++ "-name", message = "Name every list." } ]

            else
                []

        choiceErrors =
            group.options
                |> List.indexedMap
                    (\choiceIndex choice ->
                        if String.isEmpty (String.trim choice.label) then
                            [ { key = prefix ++ "-choice-" ++ String.fromInt choiceIndex
                              , message = "Fill in every item."
                              }
                            ]

                        else
                            []
                    )
                |> List.concat

        countErrors =
            if group.pickCount > List.length (List.filter (\choice -> not (String.isEmpty (String.trim choice.label))) group.options) then
                [ { key = prefix ++ "-count", message = "You cannot take more items than this list has." } ]

            else
                []
    in
    nameErrors ++ choiceErrors ++ countErrors


selectedChoices : Int -> Int -> Group -> List Choice
selectedChoices seed groupIndex group =
    group.options
        |> List.indexedMap
            (\choiceIndex choice ->
                ( pseudoScore seed groupIndex choiceIndex, choiceIndex, choice )
            )
        |> List.sortBy (\( score, choiceIndex, _ ) -> score + choiceIndex)
        |> List.take group.pickCount
        |> List.map (\( _, _, choice ) -> choice)


pseudoScore : Int -> Int -> Int -> Int
pseudoScore seed groupIndex choiceIndex =
    let
        mixed =
            seed
                + ((groupIndex + 1) * 104729)
                + ((choiceIndex + 1) * 130363)

        scrambled =
            remainderBy 2147483647 (mixed * 48271 + 1)
    in
    abs scrambled


totalPickCount : Picker -> Int
totalPickCount picker =
    picker.groups |> List.map .pickCount |> List.sum


pickLabel : Int -> String
pickLabel count =
    String.fromInt count
        ++ (if count == 1 then
                " pick"

            else
                " picks"
           )


runSummary : Picker -> String
runSummary picker =
    String.fromInt (List.length picker.groups)
        ++ (if List.length picker.groups == 1 then
                " list · "

            else
                " lists · "
           )
        ++ pickLabel (totalPickCount picker)


previewRotation : Int -> Int
previewRotation index =
    case remainderBy 4 index of
        0 ->
            -2

        1 ->
            2

        2 ->
            -1

        _ ->
            1


safeTestName : String -> String
safeTestName name =
    name
        |> String.trim
        |> String.replace " " "-"


invalidAttribute : Bool -> Html.Attribute msg
invalidAttribute isInvalid =
    attribute "aria-invalid"
        (if isInvalid then
            "true"

         else
            "false"
        )


hasError : String -> List ValidationError -> Bool
hasError key errors =
    List.any (\error -> error.key == key) errors


uniqueMessages : List ValidationError -> List String
uniqueMessages errors =
    errors
        |> List.map .message
        |> List.foldl
            (\message messages ->
                if List.member message messages then
                    messages

                else
                    messages ++ [ message ]
            )
            []


updateAt : Int -> (a -> a) -> List a -> List a
updateAt target transform items =
    List.indexedMap
        (\index item ->
            if index == target then
                transform item

            else
                item
        )
        items


removeAt : Int -> List a -> List a
removeAt target items =
    items
        |> List.indexedMap Tuple.pair
        |> List.filter (\( index, _ ) -> index /= target)
        |> List.map Tuple.second


upsertPicker : Picker -> List Picker -> List Picker
upsertPicker picker saved =
    if List.any (\item -> item.id == picker.id) saved then
        List.map
            (\item ->
                if item.id == picker.id then
                    picker

                else
                    item
            )
            saved

    else
        saved ++ [ picker ]


findPicker : List Picker -> Int -> Maybe Picker
findPicker saved id_ =
    saved |> List.filter (\picker -> picker.id == id_) |> List.head


defaultPicker : Picker
defaultPicker =
    { id = 1
    , title = "Dinner toss"
    , mechanic = Toss
    , groups =
        [ { name = "Beer"
          , background = "#ffd43b"
          , foreground = "#171717"
          , pickCount = 1
          , options =
                [ { label = "IPA", imageUrl = "" }
                , { label = "Stout", imageUrl = "" }
                , { label = "Lager", imageUrl = "" }
                ]
          }
        , { name = "Food"
          , background = "#ff6b35"
          , foreground = "#171717"
          , pickCount = 2
          , options =
                [ { label = "Burger", imageUrl = "" }
                , { label = "Pizza", imageUrl = "" }
                , { label = "Tacos", imageUrl = "" }
                ]
          }
        , { name = "Weed"
          , background = "#69db7c"
          , foreground = "#171717"
          , pickCount = 2
          , options =
                [ { label = "Runtz", imageUrl = "" }
                , { label = "Gelato 41", imageUrl = "" }
                , { label = "Permanent Marker", imageUrl = "" }
                , { label = "Zkittlez", imageUrl = "" }
                ]
          }
        ]
    }


blankPicker : Int -> Picker
blankPicker id_ =
    { id = id_
    , title = "New toss"
    , mechanic = Toss
    , groups =
        [ { name = "List 1"
          , background = "#1f6feb"
          , foreground = "#ffffff"
          , pickCount = 1
          , options =
                [ { label = "First item", imageUrl = "" }
                , { label = "Second item", imageUrl = "" }
                ]
          }
        ]
    }


flagsDecoder : Decoder Flags
flagsDecoder =
    Decode.map5 Flags
        (Decode.field "saved" (Decode.list pickerDecoder))
        (Decode.field "shared" (Decode.nullable pickerDecoder))
        (Decode.field "seed" (Decode.nullable Decode.int))
        (Decode.field "sharedError" (Decode.nullable Decode.string))
        (Decode.field "year" Decode.int)


pickerDecoder : Decoder Picker
pickerDecoder =
    Decode.map3
        (\id_ title groups ->
            { id = id_
            , title = title
            , mechanic = Toss
            , groups = groups
            }
        )
        (Decode.field "id" Decode.int)
        (Decode.field "title" Decode.string)
        (Decode.field "groups" (Decode.list groupDecoder))


groupDecoder : Decoder Group
groupDecoder =
    Decode.map5 Group
        (Decode.field "name" Decode.string)
        (Decode.field "background" Decode.string)
        (Decode.field "foreground" Decode.string)
        (Decode.field "pickCount" Decode.int)
        (Decode.field "options" (Decode.list choiceDecoder))


choiceDecoder : Decoder Choice
choiceDecoder =
    Decode.map2 Choice
        (Decode.field "label" Decode.string)
        (Decode.field "imageUrl" Decode.string)


pickerEncoder : Picker -> Encode.Value
pickerEncoder picker =
    Encode.object
        [ ( "id", Encode.int picker.id )
        , ( "title", Encode.string picker.title )
        , ( "groups", Encode.list groupEncoder picker.groups )
        ]


groupEncoder : Group -> Encode.Value
groupEncoder group =
    Encode.object
        [ ( "name", Encode.string group.name )
        , ( "background", Encode.string group.background )
        , ( "foreground", Encode.string group.foreground )
        , ( "pickCount", Encode.int group.pickCount )
        , ( "options", Encode.list choiceEncoder group.options )
        ]


choiceEncoder : Choice -> Encode.Value
choiceEncoder choice =
    Encode.object
        [ ( "label", Encode.string choice.label )
        , ( "imageUrl", Encode.string choice.imageUrl )
        ]
