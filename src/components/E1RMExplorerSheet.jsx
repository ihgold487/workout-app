import React from "react"

export default function E1RMExplorerModal({
  isOpen,
  onClose,
  setData,
  onSelectOption
}) {

  const [increment, setIncrement] = React.useState(5)
  
  function calculateSimpleE1RM() {

    if (!setData) return ""

    const weight =
      Number(setData.weight)

    const reps =
      Number(setData.reps)

    const rir =
      Number(setData.rir)

    if (
      !weight ||
      !reps
    ) {
      return ""
    }

    return Math.round(
      weight *
      (
        1 +
        (
          reps + rir
        ) / 30
      )
    )

  }
  
  function getProgressionOption() {

    if (!setData) return null

    const weight =
      Number(setData.weight)

    const reps =
      Number(setData.reps)

    const rir =
      Number(setData.rir)

    return {

      weight:
        weight + increment,

      reps,

      rir,

      e1rm:
        Math.round(
          (weight + increment) *
          (
            1 +
            (
              reps + rir
            ) / 30
          )
        )

    }

  }
  
  function getEquivalentOptions() {

    if (!setData) return []

    const weight =
      Number(setData.weight)

    const reps =
      Number(setData.reps)

    const rir =
      Number(setData.rir)

    return [

      {
        weight,
        reps:
          reps + 1
      },

      {
        weight,
        reps:
          reps + 2
      },

      {
        weight:
          weight - increment,

        reps:
          reps + 1
      },

      {
        weight:
          weight + increment,

        reps:
          reps - 1
      }

    ]

      .filter(
        option =>
          option.weight > 0
          &&
          option.reps > 0
      )

      .map(
        option => ({

          ...option,

          rir,

          e1rm:
            Math.round(
              option.weight *
              (
                1 +
                (
                  option.reps + rir
                ) / 30
              )
            )

        })
      )

  }

  if (!isOpen) return null

  return (

    <div
      style={{
        position:"fixed",
        inset:0,
        background:"rgba(0,0,0,0.5)",
        display:"flex",
        alignItems:"flex-end",
        justifyContent:"center",
        zIndex:2000
      }}
      onClick={onClose}
    >

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:"#fff",
          width:"100%",
          maxWidth:"500px",
          borderTopLeftRadius:"16px",
          borderTopRightRadius:"16px",
          padding:"16px",
          boxSizing:"border-box"
        }}
      >

        <div
          style={{
            fontSize:"18px",
            fontWeight:"bold",
            marginBottom:"12px"
          }}
        >
          e1RM Explorer
        </div>

       <div
          style={{
            fontWeight:"bold",
            fontSize:"18px",
            marginBottom:"16px"
          }}
        >
          {
            setData
              ? `${setData.weight}×${setData.reps}@${setData.rir}`
              : ""
          }

          <span
            style={{
              display:"inline-block",
              width:"16px"
            }}
          />

          🏋️

          {
            calculateSimpleE1RM()
          }

        </div>

        <div
          style={{
            marginTop:"16px"
          }}
        >
          Increment
        </div>

        <div
          style={{
            display:"flex",
            gap:"8px",
            marginTop:"8px"
          }}
        >

          {
            [2.5, 5, 10].map(
              value => (

                <button
                  key={value}

                  onClick={() =>
                    setIncrement(
                      value
                    )
                  }

                  style={{
                    width:"52px",
                    padding:"6px 0",

                    fontWeight:
                      increment === value
                        ? "bold"
                        : "normal"
                  }}
                >

                  {value}

                </button>

              )
            )
          }

        </div>
        
        <div
          style={{
            marginTop:"20px",
            fontWeight:"bold"
          }}
        >
          📈 Progression
        </div>

        {
          getProgressionOption()
          &&

          <div
            onClick={() => {

              onSelectOption?.(
                getProgressionOption()
              )

              onClose()

            }}

            style={{
              marginTop:"8px",
              cursor:"pointer"
            }}
          >
            {
              `${getProgressionOption().weight}×${getProgressionOption().reps}@${getProgressionOption().rir}`
            }

            {"  "}

            (
            {getProgressionOption().e1rm}
            )

          </div>
        }
        
        <div
          style={{
            marginTop:"20px",
            fontWeight:"bold"
          }}
        >
          ≈ Alternatives
        </div>

        {
          getEquivalentOptions()
            .map(
              option => (

                <div
                  key={
                    `${option.weight}-${option.reps}`
                  }

                  onClick={() => {

                    onSelectOption?.(
                      option
                    )

                    onClose()

                  }}

                  style={{
                    marginTop:"8px",
                    cursor:"pointer"
                  }}
                >

                  {
                    `${option.weight}×${option.reps}@${option.rir}`
                  }

                  {"  "}

                  (
                  {option.e1rm}
                  )

                </div>

              )
            )
        }

        <button
          onClick={onClose}
          style={{
            marginTop:"16px"
          }}
        >
          Close
        </button>

      </div>

    </div>

  )

}